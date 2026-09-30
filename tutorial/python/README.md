# Tutorial orders service (Python)

A small CNCF swag shop API (FastAPI, httpx, psycopg 3) for the proxymock getting-started tutorial.

## Prerequisites

Python 3.11+, Docker (for Postgres), and [proxymock](https://docs.speedscale.com/proxymock/).

## Run it

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements-dev.txt
source .venv/bin/activate

(cd .. && docker compose up -d)   # Postgres on localhost:5432

python app.py                     # listens on :8080
pytest                            # unit tests, no database needed
python traffic.py                 # drive traffic at http://localhost:8080
```

The environment variables (`PORT`, `DATABASE_URL`, `DEMO_API_URL`, `APP_VERSION`, `APP_SLOW`) are listed in [`../contract/SPEC.md`](../contract/SPEC.md).

## Record with proxymock

```sh
DATABASE_URL=postgres://tutorial:tutorial@localhost:15432/tutorial?sslmode=disable proxymock record --map 15432=postgres://localhost:5432 -- python app.py
```

In another terminal, send traffic through the proxymock inbound port:

```sh
python traffic.py http://localhost:4143
```
