import json
import re
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import app as tutorial
from app import UpstreamError, create_app, fmt_time, parse_order_request, price_for, ApiError

TS_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
CREATED = datetime(2026, 9, 30, 10, 44, 50, 123999, tzinfo=timezone.utc)

PROJECTS = {
    "kubernetes": {"id": "kubernetes", "name": "Kubernetes", "maturity": "Graduated"},
    "helm": {"id": "helm", "name": "Helm", "maturity": "Incubating"},
    "backstage": {"id": "backstage", "name": "Backstage", "maturity": "Sandbox"},
    "odd": {"id": "odd", "name": "Odd", "maturity": "Archived"},
}


class StubUpstream:
    def __init__(self, fail=False):
        self.fail = fail
        self.calls = []

    async def catalog(self):
        if self.fail:
            raise UpstreamError("down")
        return list(PROJECTS.values())

    async def project(self, project_id):
        self.calls.append(project_id)
        if self.fail:
            raise UpstreamError("down")
        return PROJECTS.get(project_id)

    async def close(self):
        pass


class StubDB:
    def __init__(self):
        self.orders = {}
        self.lines = {}

    async def create_order(self, order_id, customer, total, lines):
        self.orders[order_id] = (uuid.UUID(order_id), customer, "placed", total, CREATED)
        self.lines[order_id] = lines
        return CREATED

    async def get_order(self, order_id):
        return self.orders.get(order_id)

    async def get_lines(self, order_id):
        return self.lines.get(order_id, [])

    async def order_status(self, order_id):
        row = self.orders.get(order_id)
        return row[2] if row else None

    async def list_recent(self, cutoff):
        return [(*o, len(self.lines[str(o[0])])) for o in self.orders.values()]

    async def list_recent_orders(self, cutoff):
        return list(self.orders.values())


def client(version="v1", slow=False, upstream=None):
    a = create_app(db=StubDB(), upstream=upstream or StubUpstream(), version=version, slow=slow)
    return TestClient(a)


def post(c, body):
    return c.post("/orders", content=body if isinstance(body, (str, bytes)) else json.dumps(body))


GOOD = {"customer": "ada@example.com", "items": [{"project_id": "kubernetes", "quantity": 2}]}


# ---- validation

@pytest.mark.parametrize(
    "body,message",
    [
        ("not json", "invalid JSON body"),
        ("", "invalid JSON body"),
        ("[1]", "invalid JSON body"),
        ("null", "invalid JSON body"),
        ({"items": GOOD["items"]}, "customer is required"),
        ({"customer": "", "items": GOOD["items"]}, "customer is required"),
        ({"customer": 5, "items": GOOD["items"]}, "customer is required"),
        ({"customer": "a"}, "items must have 1 to 10 entries"),
        ({"customer": "a", "items": []}, "items must have 1 to 10 entries"),
        ({"customer": "a", "items": "x"}, "items must have 1 to 10 entries"),
        (
            {"customer": "a", "items": [{"project_id": "helm", "quantity": 1}] * 11},
            "items must have 1 to 10 entries",
        ),
        ({"customer": "a", "items": [{"quantity": 1}]}, "project_id is required"),
        ({"customer": "a", "items": [{"project_id": "", "quantity": 1}]}, "project_id is required"),
        ({"customer": "a", "items": [{"project_id": "helm"}]}, "quantity must be between 1 and 99"),
        ({"customer": "a", "items": [{"project_id": "helm", "quantity": 0}]}, "quantity must be between 1 and 99"),
        ({"customer": "a", "items": [{"project_id": "helm", "quantity": 100}]}, "quantity must be between 1 and 99"),
        ({"customer": "a", "items": [{"project_id": "helm", "quantity": "2"}]}, "quantity must be between 1 and 99"),
        ({"customer": "a", "items": [{"project_id": "helm", "quantity": True}]}, "quantity must be between 1 and 99"),
        ({"customer": "a", "items": [{"project_id": "helm", "quantity": 1.5}]}, "quantity must be between 1 and 99"),
    ],
)
def test_validation_messages(body, message):
    c = client()
    r = post(c, body)
    assert r.status_code == 400
    assert r.text == json.dumps({"error": message}, separators=(",", ":"))


def test_validation_order_first_bad_item_wins():
    with pytest.raises(ApiError) as e:
        parse_order_request(
            json.dumps(
                {"customer": "a", "items": [{"project_id": "x", "quantity": 0}, {"quantity": 1}]}
            ).encode()
        )
    assert e.value.message == "quantity must be between 1 and 99"


def test_integral_float_quantity_counts():
    req = parse_order_request(b'{"customer":"a","items":[{"project_id":"helm","quantity":2.0}]}')
    assert req["items"][0]["quantity"] == 2 and isinstance(req["items"][0]["quantity"], int)


@pytest.mark.parametrize("bad", ["1e999", "true", "false", "null", "0.0", "99.5"])
def test_bad_quantity_literals(bad):
    with pytest.raises(ApiError) as e:
        parse_order_request(('{"customer":"a","items":[{"project_id":"helm","quantity":%s}]}' % bad).encode())
    assert e.value.message == "quantity must be between 1 and 99"


@pytest.mark.parametrize(
    "path",
    [
        "/orders/{00000000-0000-4000-8000-000000000000}",
        "/orders/urn:uuid:00000000-0000-4000-8000-000000000000",
        "/orders/00000000000040008000000000000000",
    ],
)
def test_non_canonical_uuid_is_not_found_without_db(path):
    c = client()
    c.app.state.db = None  # a DB call would raise
    r = c.get(path)
    assert r.status_code == 404 and r.text == '{"error":"order not found"}'


def test_form_content_type_ignored_and_db_failure_is_500():
    c = client()
    r = c.post("/orders", content=json.dumps(GOOD), headers={"Content-Type": "text/plain"})
    assert r.status_code == 201

    class Broken(StubDB):
        async def get_order(self, order_id):
            raise RuntimeError("db down")

    c2 = TestClient(create_app(db=Broken(), upstream=StubUpstream()), raise_server_exceptions=False)
    r = c2.get("/orders/00000000-0000-4000-8000-000000000000")
    assert r.status_code == 500 and r.text == '{"error":"internal error"}'


def test_ten_items_allowed():
    req = parse_order_request(json.dumps({"customer": "a", "items": [{"project_id": "helm", "quantity": 99}] * 10}).encode())
    assert len(req["items"]) == 10


# ---- pricing and timestamps

@pytest.mark.parametrize(
    "maturity,cents",
    [("Graduated", 1200), ("Incubating", 800), ("Sandbox", 500), ("Archived", 1000), (None, 1000), ("", 1000)],
)
def test_pricing(maturity, cents):
    assert price_for(maturity) == cents


def test_timestamp_format_truncates():
    assert fmt_time(CREATED) == "2026-09-30T10:44:50.123Z"
    assert fmt_time(datetime(2026, 1, 2, 3, 4, 5, 999999, tzinfo=timezone.utc)) == "2026-01-02T03:04:05.999Z"
    assert fmt_time(datetime(2026, 1, 2, 3, 4, 5, 0, tzinfo=timezone.utc)) == "2026-01-02T03:04:05.000Z"


def test_timestamp_converts_to_utc():
    est = timezone(timedelta(hours=-5))
    assert fmt_time(datetime(2026, 1, 2, 3, 4, 5, 6000, tzinfo=est)) == "2026-01-02T08:04:05.006Z"


# ---- responses

def test_healthz_compact():
    r = client("v2").get("/healthz")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/json"
    assert r.text == '{"status":"ok"}'


def test_catalog():
    r = client().get("/catalog")
    body = r.json()
    assert list(body) == ["products", "generated_at"]
    assert list(body["products"][0]) == ["project_id", "name", "maturity", "unit_price_cents"]
    assert [p["unit_price_cents"] for p in body["products"]] == [1200, 800, 500, 1000]
    assert TS_RE.match(body["generated_at"])
    assert " " not in r.text and "\n" not in r.text


def test_order_object_key_order_and_total():
    c = client()
    body = {
        "customer": "grace@example.com",
        "items": [{"project_id": "kubernetes", "quantity": 2}, {"project_id": "helm", "quantity": 1}],
    }
    r = post(c, body)
    assert r.status_code == 201
    o = r.json()
    assert list(o) == ["id", "customer", "status", "items", "total_cents", "created_at", "generated_at"]
    assert list(o["items"][0]) == ["project_id", "name", "quantity", "unit_price_cents"]
    assert o["total_cents"] == 2 * 1200 + 800
    assert o["status"] == "placed"
    assert o["created_at"] == "2026-09-30T10:44:50.123Z"
    assert TS_RE.match(o["generated_at"])
    assert str(uuid.UUID(o["id"])) == o["id"]
    assert ", " not in r.text and '": ' not in r.text

    got = c.get("/orders/" + o["id"])
    assert got.status_code == 200
    assert list(got.json()) == list(o)
    assert got.json()["items"] == o["items"]


def test_upstream_called_once_per_item_in_order():
    up = StubUpstream()
    c = client(upstream=up)
    post(c, {"customer": "a", "items": [{"project_id": "helm", "quantity": 1}] * 2 + [{"project_id": "kubernetes", "quantity": 1}]})
    assert up.calls == ["helm", "helm", "kubernetes"]


def test_unknown_project_is_422_and_writes_nothing():
    c = client()
    r = post(c, {"customer": "a", "items": [{"project_id": "helm", "quantity": 1}, {"project_id": "nope", "quantity": 1}]})
    assert r.status_code == 422
    assert r.text == '{"error":"unknown project: nope"}'
    assert c.app.state.db.orders == {}


def test_upstream_failure_is_502():
    c = client(upstream=StubUpstream(fail=True))
    assert c.get("/catalog").text == '{"error":"catalog unavailable"}'
    r = post(c, GOOD)
    assert r.status_code == 502
    assert r.text == '{"error":"catalog unavailable"}'


def test_v2_total_is_string_in_order_and_list():
    c = client("v2")
    o = post(c, GOOD).json()
    assert o["total_cents"] == "2400"
    assert c.get("/orders/" + o["id"]).json()["total_cents"] == "2400"
    listed = c.get("/orders").json()["orders"][0]
    assert listed["total_cents"] == "2400"
    assert '"total_cents":"2400"' in c.get("/orders").text


def test_v1_total_is_number_in_list():
    c = client("v1")
    post(c, GOOD)
    r = c.get("/orders")
    assert '"total_cents":2400' in r.text
    body = r.json()
    assert list(body) == ["orders", "generated_at"]
    assert list(body["orders"][0]) == ["id", "customer", "status", "item_count", "total_cents", "created_at"]
    assert body["orders"][0]["item_count"] == 1


def test_slow_list_uses_line_counts():
    c = client(slow=True)
    post(c, {"customer": "a", "items": [{"project_id": "helm", "quantity": 1}, {"project_id": "kubernetes", "quantity": 1}]})
    assert c.get("/orders").json()["orders"][0]["item_count"] == 2


def test_status():
    c = client()
    oid = post(c, GOOD).json()["id"]
    r = c.get(f"/orders/{oid}/status")
    assert r.status_code == 200
    body = r.json()
    assert list(body) == ["id", "status", "generated_at"]
    assert body["status"] == "placed" and body["id"] == oid


def test_not_found_cases():
    c = client()
    missing = "00000000-0000-4000-8000-000000000000"
    for path in ["/orders/not-a-uuid", "/orders/not-a-uuid/status", f"/orders/{missing}", f"/orders/{missing}/status"]:
        r = c.get(path)
        assert r.status_code == 404
        assert r.text == '{"error":"order not found"}'


def test_unknown_path():
    r = client().get("/nope")
    assert r.status_code == 404
    assert r.text == '{"error":"not found"}'
    assert r.headers["content-type"] == "application/json"
