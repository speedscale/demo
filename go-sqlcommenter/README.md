# Go sqlcommenter Demo App

A small Go orders API on Postgres 16 that tags every SQL statement with the request that ran it.

Each statement carries a [sqlcommenter](https://google.github.io/sqlcommenter/spec/) comment with the inbound request's W3C `traceparent` and its route:

```sql
SELECT id, customer, total::float8, created_at FROM orders WHERE id = $1 /*db_driver='pgx',route='%2Forders%2F%7Bid%7D',traceparent='00-8518655f3f985a63bbedceb6d0359555-6d1c2b8e4f0a9e17-01'*/
```

proxymock reads that comment and links the statement to the inbound request with the same trace id, exactly, instead of guessing from timing.

The demo exists to show that link in a recording, in proxymock web and in `proxymock sql-report`.

## How the app tags its SQL

`sqlcomment.go` holds the whole mechanism, in about a hundred lines and with no tracing library:

- A middleware reads the inbound `traceparent` header and continues that trace with a new span id of its own. When no valid `traceparent` arrives, the app starts a new trace.
- The trace context and the route template (such as `/orders/{id}`) go into the request context.
- `tag(ctx, sql)` appends the comment in the sqlcommenter format: keys sorted, values URL-encoded and single-quoted.
- The app echoes the `traceparent` it used in the response, so `curl -i` shows the trace id to look for.

In a real service an OpenTelemetry SDK and a sqlcommenter integration do this for you. [Link queries to the request that ran them](https://docs.speedscale.com/proxymock/guides/link-queries-to-requests/) lists the setup for each framework.

The app uses `github.com/jackc/pgx/v5` with its default statement cache, so most statements go over the wire as the extended protocol: Parse, Describe, Bind, Execute.

| Endpoint | SQL | Tagged |
|---|---|---|
| `GET /health` | `SELECT count(*) FROM products` | No: health checks are rarely traced |
| `GET /products` | One `SELECT` | Yes |
| `GET /products/{id}` | A named prepared statement, prepared once per connection and reused (see below) | Only the request that prepared it |
| `GET /orders/{id}` | The order, then its items | Yes |
| `POST /orders` | A transaction: `BEGIN`, `INSERT`, an `UPDATE` and an `INSERT` per item, `UPDATE`, `COMMIT` | Yes, `BEGIN` and `COMMIT` included |
| `GET /reports/sales` | `SELECT pg_sleep(0.2)`, then an aggregate | Yes |

`GET /reports/sales` is slow on purpose, so that concurrent reports overlap. That is when linking by timing becomes a guess and the trace id decides.

### The prepared statement caveat

`GET /products/{id}` prepares its statement once per connection, by whichever request gets there first, and every later request on that connection reuses it.

This is what an ORM statement cache keyed on the uncommented SQL does, and it is the caveat of comment tagging: the reused statement keeps the comment of the request that prepared it, so it names a trace that has already finished.

proxymock only links a statement by trace id when the request with that trace id also contains the statement in time. A stale comment fails that check, so those executions fall back to timing instead of linking to the wrong request.

## Prerequisites

- Go 1.25 or later
- Docker, for Postgres (or any Postgres you can reach)
- [proxymock](https://docs.speedscale.com/proxymock/getting-started/installation/) v2.5.1153 or later, which reads trace context from SQL comments

## Configuration

The app reads the standard libpq environment variables, with defaults that match the compose file:

| Variable | Default |
|---|---|
| `PGHOST` | `localhost` |
| `PGPORT` | `5432` |
| `PGUSER` | `demo` |
| `PGPASSWORD` | `demo` |
| `PGDATABASE` | `shop` |
| `PORT` | `8080`, the port the API listens on |

`DATABASE_URL` overrides all of the `PG*` variables.

On start-up the app creates the `products`, `orders` and `order_items` tables if they do not exist and seeds five products and one order. Those statements run outside any request, so they are untagged.

## Run with docker compose

This starts Postgres and the app together:

```bash
docker compose up --build
```

If something already uses port 5432 or 8080, move them with `PG_HOST_PORT` and `APP_HOST_PORT`.

Stop everything and delete the data volume with `docker compose down -v`.

## Record it with proxymock

Start only Postgres:

```bash
docker compose up -d --wait postgres
```

Start proxymock with a Postgres listener on port 15432 that forwards to the real database:

```bash
proxymock record --map 15432=postgres://localhost:5432 --app-port 8080
```

In a second terminal, start the app pointed at proxymock instead of Postgres:

```bash
PGPORT=15432 go run .
```

In a third terminal, send the load through proxymock's inbound proxy on port 4143:

```bash
./load.sh
```

The script prints the trace id of every request it sends:

- one untagged health check
- one request at a time to `/products`, `/orders/1` and `POST /orders`, each with its own trace
- four overlapping `/reports/sales` requests, each with its own trace
- eight product lookups through the reused prepared statement
- two requests with no `traceparent`, so the app starts the trace itself

Stop proxymock with Ctrl-C. The recording lands in `proxymock/recorded-<timestamp>/`.

## What to look for

### `proxymock sql-report`

```bash
proxymock sql-report --in proxymock/recorded-<timestamp> -o pretty
```

The per-request section opens with a line like this one, from a run of `./load.sh` against a fresh database:

```text
Statements per inbound request (18 requests, 31 statements attributed, 20 of them by the trace id in their SQL comment, 1 outside any request):
```

- 20 statements are linked by trace id: the 8 in the order transaction, the 8 in the four overlapping reports, the 2 for `/orders/1`, the 1 for `/products`, and the first product lookup, which prepared the statement.
- 11 are linked by timing: the untagged health check, the 7 product lookups that reused a statement prepared by an earlier request, and the 3 statements of the two requests that arrived without a `traceparent`.
- 1 ran outside any request: the start-up schema and seed.

The overlapping reports are not counted as ambiguous, because their trace ids, not their timing, decided where they belong.

`-o json` gives the same figures as `requestLoad.exactStatements`, `attributedStatements` and `ambiguousStatements`.

### proxymock web

```bash
proxymock web
```

- Open any Postgres pair. Its detail shows **Caused by** with the request that ran it, marked **by trace id** when the comment named that request and **by time** when proxymock inferred it.
- Open the Trace view (the **Trace** lens on the Requests list). Database calls linked through their comment get a chain badge, and the header counts how many were linked by trace ID and how many by timing.
- Add the filter **Trace ID** with one of the ids `load.sh` printed. The list narrows to that request and the queries it ran, which is the quickest way to see one request's SQL.

A request that arrived without a `traceparent` carries no trace id of its own, so its statements link by timing. A service that starts a trace and then calls another service passes the trace on in that call, and proxymock uses the call to link the statements exactly.

## Run the tests

```bash
make test
```

The tests check the comment format against the sqlcommenter spec and the trace context handling. They need no database.
