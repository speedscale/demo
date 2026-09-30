# Tutorial orders service: behavior contract

Every language port (`go/`, `java/`, `python/`, `node/`) implements exactly this contract. The Go port is the reference. A port conforms when a recording of it, driven by its traffic driver, has the same inbound requests and responses, the same outbound HTTP calls and the same SQL statements as the Go recording, ignoring the values listed under "Planted work".

If this file and a port disagree, the port is wrong. If this file is ambiguous, fix this file and every port together.

## What it is

A small CNCF swag shop. Customers order stickers and shirts of CNCF projects. The service checks each project against the hosted CNCF projects API (`https://demo-api.trafficreplay.com`), prices it by maturity, and stores the order in Postgres.

## Configuration (environment variables)

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | HTTP listen port |
| `DATABASE_URL` | `postgres://tutorial:tutorial@localhost:5432/tutorial?sslmode=disable` | Postgres URL, always in this `postgres://` form in every language (Java converts it to JDBC itself) |
| `DEMO_API_URL` | `https://demo-api.trafficreplay.com` | Base URL of the CNCF projects API, no trailing slash |
| `APP_VERSION` | `v1` | `v2` turns on the planted regression |
| `APP_SLOW` | `0` | `1` turns on the planted N+1 query |

On start the service logs exactly one line: `tutorial-orders (<language>) listening on :<PORT> version=<APP_VERSION> slow=<true|false>`.

## Proxy and TLS (so `proxymock record -- <cmd>` works with no extra setup)

proxymock starts the app with `http_proxy`/`https_proxy` (lowercase) pointing at its outbound proxy, and `SSL_CERT_FILE` / `REQUESTS_CA_BUNDLE` pointing at its CA certificate. For a JVM it also sets `JAVA_TOOL_OPTIONS` with `-Dhttps.proxyHost/Port` and a truststore. Each port must route outbound HTTP through that proxy and trust that CA when those are set, and go direct when they are not:

* Go: `http.ProxyFromEnvironment` (the default transport) is enough. Nothing extra.
* Java: build `java.net.http.HttpClient` with `.proxy(ProxySelector.getDefault())` so the JVM proxy properties apply. The truststore comes from `JAVA_TOOL_OPTIONS`.
* Python: `httpx` with `trust_env=True` (the default) reads the proxy variables. Pass `verify=` an `ssl.SSLContext` that loads the system defaults plus `SSL_CERT_FILE` when that variable is set.
* Node: global `fetch` ignores proxy variables. When `https_proxy`/`HTTPS_PROXY` is set, install an `undici` `EnvHttpProxyAgent` as the global dispatcher and make outbound calls with `undici`'s own `fetch`. When `SSL_CERT_FILE` is set, pass `[...tls.rootCertificates, <that CA>]` as `ca` in `connect`, `requestTls` and `proxyTls`: for an HTTPS request through the proxy, undici verifies the target with `requestTls`, not `connect`.

Postgres is recorded through `proxymock record --map <port>=postgres://localhost:5432` with `DATABASE_URL` pointed at the mapped port, so the database driver needs nothing special.

## Database access rules

* Use the SQL below character for character. Placeholders are `$1`, `$2` ... (Java writes `?`, which the JDBC driver sends as `$1`; Python psycopg writes `%s`, which it sends as `$1`). The explicit casts are part of the text.
* No ORM. Go: pgx v5 pool. Java: Spring `JdbcTemplate` over the PostgreSQL JDBC driver. Python: psycopg 3 with `psycopg_pool`. Node: `pg` Pool.
* No named server-side prepared statements, so every language puts the same thing on the wire. Go: `default_query_exec_mode=describe_exec` (or set `DefaultQueryExecMode = pgx.QueryExecModeDescribeExec`). Java: add `prepareThreshold=0` to the JDBC URL. Python: `prepare_threshold=None` and `autocommit=True` on pool connections, with `conn.transaction()` around the order insert (without autocommit psycopg wraps every read in BEGIN/COMMIT). Node: `pg` default (unnamed statements), never pass a `name`.
* Pool size: at most 5 connections.
* Session setup a driver sends on its own (JDBC's `SET application_name`, `SHOW TRANSACTION ISOLATION LEVEL` and the like) is fine; the conformance check ignores it.

The statements:

```sql
-- S1 create order (inside a transaction, returns created_at)
INSERT INTO orders (id, customer, status, total_cents) VALUES ($1::uuid, $2, 'placed', $3) RETURNING created_at
-- S2 create order line (inside the same transaction, once per item, in request order)
INSERT INTO order_items (order_id, project_id, name, quantity, unit_price_cents) VALUES ($1::uuid, $2, $3, $4, $5)
-- S3 get order
SELECT id, customer, status, total_cents, created_at FROM orders WHERE id = $1::uuid
-- S4 get order lines
SELECT project_id, name, quantity, unit_price_cents FROM order_items WHERE order_id = $1::uuid ORDER BY id
-- S5 list recent orders (APP_SLOW=1 only)
SELECT id, customer, status, total_cents, created_at FROM orders WHERE created_at > $1::timestamptz ORDER BY created_at DESC LIMIT 50
-- S6 list recent orders with item counts (default)
SELECT o.id, o.customer, o.status, o.total_cents, o.created_at, COUNT(i.id) AS item_count FROM orders o LEFT JOIN order_items i ON i.order_id = o.id WHERE o.created_at > $1::timestamptz GROUP BY o.id ORDER BY o.created_at DESC LIMIT 50
-- S7 order status
SELECT status FROM orders WHERE id = $1::uuid
```

## Outbound HTTP

Every call to the CNCF projects API:

* Method `GET`, URL `{DEMO_API_URL}{path}?ts={unix time in milliseconds}`.
* Headers: `Accept: application/json`, `User-Agent: tutorial-orders/1`, `X-Request-Id: {fresh random UUID v4}`. Other headers the client library adds on its own are fine.
* 5 second timeout.
* A 404 from upstream means "unknown project". A network error, a timeout or any other non-200 status is `502 {"error":"catalog unavailable"}` to our caller.

Paths: `/v1/projects` (the whole catalog, a bare JSON array) and `/v1/project/{project_id}` (one project, a JSON object). Upstream project objects have `id`, `name`, `maturity` (`Graduated`, `Incubating` or `Sandbox`) and other fields we ignore.

Price by maturity, in cents: `Graduated` 1200, `Incubating` 800, `Sandbox` 500. Any other maturity: 1000.

## Responses

* Always `Content-Type: application/json`, compact JSON (no spaces or newlines), keys in exactly the order shown.
* Timestamps: UTC, RFC 3339, exactly three fractional digits, `Z` suffix, e.g. `2026-09-30T10:44:50.123Z`. Truncate, do not round. Postgres stores microseconds; make sure the driver does not round them on the way in (Node `pg` needs its own `timestamptz` parser).
* `generated_at` is the time the response was built.
* Errors are `{"error":"<message>"}` with the exact messages below.
* Order ids in responses are always lowercase, including the `id` echoed by `GET /orders/{id}/status` when the request used uppercase.

### GET /healthz

`200 {"status":"ok"}`. No database or upstream call. It does not report `APP_VERSION` (the startup log line does), so a v2 regression shows up in the order data rather than in the health check.

### GET /catalog

One upstream call to `/v1/projects`. Response `200`:

```json
{"products":[{"project_id":"kubernetes","name":"Kubernetes","maturity":"Graduated","unit_price_cents":1200}],"generated_at":"..."}
```

Products in upstream order.

### POST /orders

Request body: `{"customer":"ada@example.com","items":[{"project_id":"kubernetes","quantity":2}]}`

Validation, in this order, each `400`. The `Content-Type` header is ignored: the body is always parsed as JSON.

1. Body is empty, not valid JSON, or not a JSON object: `invalid JSON body`
2. `customer` missing, not a string, or empty: `customer is required`
3. `items` missing, not an array, empty, or more than 10 entries: `items must have 1 to 10 entries`
4. For each item in order: `project_id` missing, not a string, or empty: `project_id is required`; `quantity` missing, not a number, has a fractional part (`1.5`; `2.0` counts as 2), or outside 1..99: `quantity must be between 1 and 99`

Then, for each item in request order, one upstream call to `/v1/project/{project_id}` (sequential, one per item even if a project repeats). A 404 stops processing: `422 {"error":"unknown project: <project_id>"}`. Nothing is written to the database in that case.

Then generate the order id (random UUID v4, lowercase), compute `total_cents` = sum of `quantity * unit_price_cents`, and in one transaction run S1 once and S2 once per item. Response `201` with the order object (below).

### GET /orders/{id}

A valid id is exactly the canonical form: 8-4-4-4-12 hexadecimal digits with hyphens, any case. Braces, `urn:uuid:` and unhyphenated forms are not valid.

If `{id}` is not a valid UUID: `404 {"error":"order not found"}` with no database call. Otherwise run S3; no row: `404 {"error":"order not found"}`. Then run S4. Response `200` with the order object.

### GET /orders/{id}/status

Same UUID and not-found handling as above, using S7. Response `200 {"id":"...","status":"placed","generated_at":"..."}`.

### GET /orders

Recent orders: the cutoff is the current time minus one hour, computed in the app and passed as the `$1` parameter.

* Default: run S6.
* `APP_SLOW=1`: run S5, then S4 once per returned order, and use the number of rows as `item_count`.

Response `200`:

```json
{"orders":[{"id":"...","customer":"ada@example.com","status":"placed","item_count":1,"total_cents":2400,"created_at":"..."}],"generated_at":"..."}
```

### The order object

```json
{"id":"...","customer":"ada@example.com","status":"placed","items":[{"project_id":"kubernetes","name":"Kubernetes","quantity":2,"unit_price_cents":1200}],"total_cents":2400,"created_at":"...","generated_at":"..."}
```

`created_at` comes from the database (`RETURNING created_at` on create, S3 on read).

### Anything else

Unknown path: `404 {"error":"not found"}`. Wrong method on a known path: `404 {"error":"not found"}` or the framework's 405, either is fine.

Any failure the contract does not name (the database is down, for example): `500 {"error":"internal error"}`.

## Planted work

These exist on purpose. Each one is what a tutorial chapter's skill finds and fixes. Do not "fix" them in the app.

| Plant | Where | Found and fixed by |
| --- | --- | --- |
| `ts` query parameter changes on every outbound call | outbound HTTP | tune the mocks: a mock blueprint that ignores `ts` |
| `X-Request-Id` header changes on every outbound call | outbound HTTP | nothing: headers are outside the mock signature, and the skill should say so |
| SQL mocks match on statement text, not bind values, so `GET /orders/{id}` with an id that was never recorded (or any lookup out of recorded order) is served another recorded row | SQL (S3, S4, S7) | tune the mocks: proxymock reports these as bind drift or fallback matches; key S3, S4 and S7 on `$1` with `sql_key_params` |
| The order id in S1/S2 and the list cutoff in S5/S6 change every run | SQL | nothing: they do not affect matching, and they must not be keyed (keying them would turn every run into misses) |
| `generated_at` in every response, and the random `id` in `POST /orders` | inbound responses | tune the tests: the default config already ignores them; the chapter creates a config from the stricter `standard` one (`proxymock test-config new tutorial --from standard`), finds both with `proxymock drift`, and ignores them |
| `APP_VERSION=v2`: `total_cents` is rendered as a string (`"2400"`) in the order object and in `GET /orders` | inbound responses | the regression test, as a `type_change` mismatch |
| `APP_SLOW=1`: `GET /orders` runs S5 plus S4 per order | SQL | the performance test, run with the HTTP dependency mocked and the real database (a mocked database never recorded the slow path's queries) |

## Traffic driver

Each port ships a driver in its own language that reads `contract/traffic.json` and sends this exact sequence, one request at a time, to a base URL given as the first argument (default `http://localhost:8080`):

1. `GET /healthz`, expect 200
2. `catalog_calls` times `GET /catalog`, expect 200
3. For `i` in `0 .. order_rounds-1`: `POST /orders` with `orders[i % len(orders)]`, expect 201, take `id` from the response, then `GET /orders/{id}` expect 200, then `GET /orders/{id}/status` expect 200
4. `list_calls` times `GET /orders`, expect 200
5. Each entry of `bad_requests` in order, expecting its `expect` status

Every request sends `Accept: application/json` and `User-Agent: tutorial-traffic/1`, and POSTs send `Content-Type: application/json` with a compact JSON body. 10 second timeout per request. No proxy: the driver talks to the base URL directly even when proxy variables are set.

The driver prints one line per unexpected status (`method path: got X, want Y`) and ends with `sent N requests, M unexpected`. It exits non-zero if `M > 0` or a request fails. With the shipped `traffic.json` it sends 135 requests.
