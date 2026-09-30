"""Tutorial orders service (Python port). Behavior contract: ../contract/SPEC.md."""

import json
import os
import re
import ssl
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import httpx
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from psycopg_pool import AsyncConnectionPool
from starlette.exceptions import HTTPException as StarletteHTTPException

LANGUAGE = "python"
PRICES = {"Graduated": 1200, "Incubating": 800, "Sandbox": 500}
DEFAULT_PRICE = 1000
UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")

S1 = "INSERT INTO orders (id, customer, status, total_cents) VALUES (%s::uuid, %s, 'placed', %s) RETURNING created_at"
S2 = "INSERT INTO order_items (order_id, project_id, name, quantity, unit_price_cents) VALUES (%s::uuid, %s, %s, %s, %s)"
S3 = "SELECT id, customer, status, total_cents, created_at FROM orders WHERE id = %s::uuid"
S4 = "SELECT project_id, name, quantity, unit_price_cents FROM order_items WHERE order_id = %s::uuid ORDER BY id"
S5 = (
    "SELECT id, customer, status, total_cents, created_at FROM orders "
    "WHERE created_at > %s::timestamptz ORDER BY created_at DESC LIMIT 50"
)
S6 = (
    "SELECT o.id, o.customer, o.status, o.total_cents, o.created_at, COUNT(i.id) AS item_count "
    "FROM orders o LEFT JOIN order_items i ON i.order_id = o.id "
    "WHERE o.created_at > %s::timestamptz GROUP BY o.id ORDER BY o.created_at DESC LIMIT 50"
)
S7 = "SELECT status FROM orders WHERE id = %s::uuid"


# ---------------------------------------------------------------- helpers


def fmt_time(dt: datetime) -> str:
    """UTC RFC 3339 with exactly three fractional digits, truncated."""
    dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S.") + f"{dt.microsecond // 1000:03d}Z"


def now_str() -> str:
    return fmt_time(datetime.now(timezone.utc))


def price_for(maturity) -> int:
    return PRICES.get(maturity, DEFAULT_PRICE) if isinstance(maturity, str) else DEFAULT_PRICE


def render_total(total_cents: int, version: str):
    """v2 is the planted regression: total_cents becomes a JSON string."""
    return str(total_cents) if version == "v2" else total_cents


def build_order(order_id, customer, status, items, total_cents, created_at, version) -> dict:
    return {
        "id": str(order_id),
        "customer": customer,
        "status": status,
        "items": [
            {
                "project_id": it["project_id"],
                "name": it["name"],
                "quantity": it["quantity"],
                "unit_price_cents": it["unit_price_cents"],
            }
            for it in items
        ],
        "total_cents": render_total(total_cents, version),
        "created_at": fmt_time(created_at),
        "generated_at": now_str(),
    }


def build_order_summary(order_id, customer, status, item_count, total_cents, created_at, version) -> dict:
    return {
        "id": str(order_id),
        "customer": customer,
        "status": status,
        "item_count": item_count,
        "total_cents": render_total(total_cents, version),
        "created_at": fmt_time(created_at),
    }


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


def err(status: int, message: str) -> JSONResponse:
    return JSONResponse({"error": message}, status_code=status)


def parse_order_request(body: bytes) -> dict:
    """Validate a POST /orders body in SPEC order. Raises ApiError(400)."""
    try:
        data = json.loads(body, parse_constant=_reject_constant)
    except ValueError:
        raise ApiError(400, "invalid JSON body")
    if not isinstance(data, dict):
        raise ApiError(400, "invalid JSON body")
    customer = data.get("customer")
    if not isinstance(customer, str) or customer == "":
        raise ApiError(400, "customer is required")
    items = data.get("items")
    if not isinstance(items, list) or not 1 <= len(items) <= 10:
        raise ApiError(400, "items must have 1 to 10 entries")
    out = []
    for item in items:
        item = item if isinstance(item, dict) else {}
        project_id = item.get("project_id")
        if not isinstance(project_id, str) or project_id == "":
            raise ApiError(400, "project_id is required")
        quantity = item.get("quantity")
        if isinstance(quantity, float) and quantity.is_integer():
            quantity = int(quantity)  # 2.0 counts as 2
        if isinstance(quantity, bool) or not isinstance(quantity, int) or not 1 <= quantity <= 99:
            raise ApiError(400, "quantity must be between 1 and 99")
        out.append({"project_id": project_id, "quantity": quantity})
    return {"customer": customer, "items": out}


def _reject_constant(name):
    raise ValueError(f"invalid constant {name}")


# ---------------------------------------------------------------- upstream


class UpstreamError(Exception):
    pass


def make_ssl_context() -> ssl.SSLContext:
    ctx = ssl.create_default_context()
    cafile = os.environ.get("SSL_CERT_FILE")
    if cafile:
        ctx.load_verify_locations(cafile=cafile)
    return ctx


class Upstream:
    """Client for the hosted CNCF projects API."""

    def __init__(self, base_url: str, client: httpx.AsyncClient | None = None):
        self.base_url = base_url.rstrip("/")
        self.client = client or httpx.AsyncClient(trust_env=True, timeout=5.0, verify=make_ssl_context())

    async def close(self):
        await self.client.aclose()

    async def _get(self, path: str):
        """Returns (status, parsed JSON or None). Network problems raise UpstreamError."""
        url = f"{self.base_url}{path}?ts={int(time.time() * 1000)}"
        headers = {
            "Accept": "application/json",
            "User-Agent": "tutorial-orders/1",
            "X-Request-Id": str(uuid.uuid4()),
        }
        try:
            resp = await self.client.get(url, headers=headers)
        except httpx.HTTPError as exc:
            raise UpstreamError(str(exc)) from exc
        if resp.status_code != 200:
            return resp.status_code, None
        try:
            return 200, resp.json()
        except ValueError as exc:
            raise UpstreamError("bad JSON from upstream") from exc

    async def catalog(self) -> list:
        status, data = await self._get("/v1/projects")
        if status != 200 or not isinstance(data, list):
            raise UpstreamError(f"catalog: status {status}")
        return data

    async def project(self, project_id: str):
        """Returns the project dict, or None when upstream says 404."""
        status, data = await self._get("/v1/project/" + quote(project_id, safe=""))
        if status == 404:
            return None
        if status != 200 or not isinstance(data, dict):
            raise UpstreamError(f"project {project_id}: status {status}")
        return data


# ---------------------------------------------------------------- database


class Database:
    """psycopg 3 access. SQL text is fixed by the SPEC."""

    def __init__(self, url: str):
        self.pool = AsyncConnectionPool(
            url,
            min_size=1,
            max_size=5,
            # autocommit: reads send no BEGIN/COMMIT; create_order opens its own transaction
            kwargs={"prepare_threshold": None, "autocommit": True},
            timeout=10,
            open=False,
        )

    async def open(self):
        await self.pool.open()

    async def close(self):
        await self.pool.close()

    async def create_order(self, order_id: str, customer: str, total_cents: int, lines: list) -> datetime:
        async with self.pool.connection() as conn:
            async with conn.transaction():
                cur = await conn.execute(S1, (order_id, customer, total_cents))
                row = await cur.fetchone()
                for ln in lines:
                    await conn.execute(
                        S2,
                        (order_id, ln["project_id"], ln["name"], ln["quantity"], ln["unit_price_cents"]),
                    )
        return row[0]

    async def get_order(self, order_id: str):
        """Returns (id, customer, status, total_cents, created_at) or None."""
        async with self.pool.connection() as conn:
            cur = await conn.execute(S3, (order_id,))
            return await cur.fetchone()

    async def get_lines(self, order_id: str) -> list:
        async with self.pool.connection() as conn:
            cur = await conn.execute(S4, (order_id,))
            rows = await cur.fetchall()
        return [
            {"project_id": r[0], "name": r[1], "quantity": r[2], "unit_price_cents": r[3]} for r in rows
        ]

    async def order_status(self, order_id: str):
        async with self.pool.connection() as conn:
            cur = await conn.execute(S7, (order_id,))
            row = await cur.fetchone()
        return row[0] if row else None

    async def list_recent(self, cutoff: datetime) -> list:
        """S6: rows of (id, customer, status, total_cents, created_at, item_count)."""
        async with self.pool.connection() as conn:
            cur = await conn.execute(S6, (cutoff,))
            return await cur.fetchall()

    async def list_recent_orders(self, cutoff: datetime) -> list:
        """S5: rows of (id, customer, status, total_cents, created_at)."""
        async with self.pool.connection() as conn:
            cur = await conn.execute(S5, (cutoff,))
            return await cur.fetchall()


# ---------------------------------------------------------------- app


def create_app(db=None, upstream=None, version: str | None = None, slow: bool | None = None) -> FastAPI:
    version = version if version is not None else os.environ.get("APP_VERSION", "v1")
    slow = slow if slow is not None else os.environ.get("APP_SLOW", "0") == "1"
    port = os.environ.get("PORT", "8080")

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        if app.state.db is None:
            app.state.db = Database(
                os.environ.get("DATABASE_URL", "postgres://tutorial:tutorial@localhost:5432/tutorial?sslmode=disable")
            )
        if app.state.upstream is None:
            app.state.upstream = Upstream(os.environ.get("DEMO_API_URL", "https://demo-api.trafficreplay.com"))
        if hasattr(app.state.db, "open"):
            await app.state.db.open()
        print(
            f"tutorial-orders ({LANGUAGE}) listening on :{port} version={version} slow={str(slow).lower()}",
            flush=True,
        )
        yield
        await app.state.upstream.close()
        await app.state.db.close()

    app = FastAPI(
        lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None, redirect_slashes=False
    )
    app.state.db = db
    app.state.upstream = upstream

    @app.exception_handler(StarletteHTTPException)
    async def http_error(request: Request, exc: StarletteHTTPException):
        if exc.status_code == 404:
            return err(404, "not found")
        return err(exc.status_code, str(exc.detail))

    @app.exception_handler(Exception)
    async def unexpected(request: Request, exc: Exception):
        print(f"internal error: {exc!r}", flush=True)
        return err(500, "internal error")

    @app.exception_handler(ApiError)
    async def api_error(request: Request, exc: ApiError):
        return err(exc.status, exc.message)

    @app.exception_handler(UpstreamError)
    async def upstream_error(request: Request, exc: UpstreamError):
        return err(502, "catalog unavailable")

    @app.get("/healthz")
    async def healthz():
        return JSONResponse({"status": "ok"})

    @app.get("/catalog")
    async def catalog():
        projects = await app.state.upstream.catalog()
        products = [
            {
                "project_id": p.get("id"),
                "name": p.get("name"),
                "maturity": p.get("maturity"),
                "unit_price_cents": price_for(p.get("maturity")),
            }
            for p in projects
            if isinstance(p, dict)
        ]
        return JSONResponse({"products": products, "generated_at": now_str()})

    @app.post("/orders")
    async def create_order(request: Request):
        req = parse_order_request(await request.body())
        lines = []
        for item in req["items"]:
            project = await app.state.upstream.project(item["project_id"])
            if project is None:
                return err(422, f"unknown project: {item['project_id']}")
            lines.append(
                {
                    "project_id": item["project_id"],
                    "name": project.get("name"),
                    "quantity": item["quantity"],
                    "unit_price_cents": price_for(project.get("maturity")),
                }
            )
        order_id = str(uuid.uuid4())
        total = sum(ln["quantity"] * ln["unit_price_cents"] for ln in lines)
        created_at = await app.state.db.create_order(order_id, req["customer"], total, lines)
        body = build_order(order_id, req["customer"], "placed", lines, total, created_at, version)
        return JSONResponse(body, status_code=201)

    @app.get("/orders/{order_id}")
    async def get_order(order_id: str):
        if not UUID_RE.match(order_id):
            return err(404, "order not found")
        row = await app.state.db.get_order(order_id)
        if row is None:
            return err(404, "order not found")
        lines = await app.state.db.get_lines(order_id)
        return JSONResponse(build_order(row[0], row[1], row[2], lines, row[3], row[4], version))

    @app.get("/orders/{order_id}/status")
    async def order_status(order_id: str):
        if not UUID_RE.match(order_id):
            return err(404, "order not found")
        status = await app.state.db.order_status(order_id)
        if status is None:
            return err(404, "order not found")
        return JSONResponse({"id": order_id.lower(), "status": status, "generated_at": now_str()})

    @app.get("/orders")
    async def list_orders():
        cutoff = datetime.now(timezone.utc) - timedelta(hours=1)
        orders = []
        if slow:
            for r in await app.state.db.list_recent_orders(cutoff):
                count = len(await app.state.db.get_lines(str(r[0])))
                orders.append(build_order_summary(r[0], r[1], r[2], count, r[3], r[4], version))
        else:
            for r in await app.state.db.list_recent(cutoff):
                orders.append(build_order_summary(r[0], r[1], r[2], r[5], r[3], r[4], version))
        return JSONResponse({"orders": orders, "generated_at": now_str()})

    return app


app = create_app()

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="0.0.0.0",
        port=int(os.environ.get("PORT", "8080")),
        access_log=False,
        log_level="warning",
    )
