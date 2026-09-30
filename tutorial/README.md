# proxymock tutorial app

The demo service for the proxymock getting-started tutorial, where a coding agent records traffic, tunes the tests and mocks, and runs a regression test and a performance test.

It is a small CNCF swag shop: an HTTP API that prices orders by looking up CNCF projects on a hosted API and stores them in Postgres. The same service is written in four languages that behave identically, so the tutorial reads the same whichever you pick.

| Language | Directory | Stack |
| --- | --- | --- |
| Go | [go/](go/) | net/http, pgx |
| Java | [java/](java/) | Spring Boot, JdbcTemplate |
| Python | [python/](python/) | FastAPI, httpx, psycopg |
| Node.js | [node/](node/) | Express, pg |

## Quick start

1. Start Postgres from this directory: `docker compose up -d`. Set `TUTORIAL_DB_PORT` if port 5432 is taken, and point `DATABASE_URL` at that port.
2. Follow the README in your language's directory to run the app and send it traffic.

## What is in here

* [contract/SPEC.md](contract/SPEC.md): the behavior every port implements, including the exact SQL, the JSON shapes, and the planted work the tutorial chapters find and fix.
* [contract/openapi.yaml](contract/openapi.yaml): the API.
* [contract/schema.sql](contract/schema.sql): the database schema, loaded by `compose.yaml`.
* [contract/traffic.json](contract/traffic.json): the request sequence each language's traffic driver sends (135 requests).
* [conformance/](conformance/): checks that a port's recording has the same shape as the Go reference.

## Switches the tutorial uses

| Variable | Effect |
| --- | --- |
| `APP_VERSION=v2` | `total_cents` is returned as a string. The regression test catches it. |
| `APP_SLOW=1` | `GET /orders` runs one query per order. The performance test catches it. |
