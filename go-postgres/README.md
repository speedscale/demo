# Go PostgreSQL Demo App

A simple Go web application that provides REST API endpoints for user management with PostgreSQL database.

## Prerequisites

- Go 1.19 or later
- PostgreSQL server running on localhost:5432
- Database named `userdb` with credentials `postgres:postgres`

## Setup

1. Create PostgreSQL and start database:
Starting Postgres on MacOS can be done with:
```bash
brew services start postgresql@15
```

And you can create the databse in psql with:

```sql
CREATE DATABASE userdb;
```

2. Install dependencies:
```bash
go mod tidy
```

3. Point the app at your database if it is not `postgres` on port 5432.
The app connects to `localhost` and the `postgres` database, and reads the port and user from `PGPORT` and `PGUSER`:
```bash
export PGPORT=5432
export PGUSER=$(whoami)
```

4. Run the application:
```bash
go run .
```

The server will start on port 8080 and automatically:
- Create the users table
- Populate it with 5 demo users

## API Endpoints

- `GET /users` - List all users
- `POST /users` - Create a new user
- `PUT /users/{id}` - Update a user by ID
- `DELETE /users/{id}` - Delete a user by ID

## User Schema

Each user has the following fields:
- id (auto-generated)
- first_name
- last_name
- email (unique)
- username (unique)
- age
- phone
- address
- city
- country
- job_title
- department
- salary
- hire_date
- is_active

## Example Usage

```bash
# List all users
curl http://localhost:8080/users

# Create a new user
curl -X POST http://localhost:8080/users \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Test","last_name":"User","email":"test@example.com","username":"testuser"}'

# Update a user
curl -X PUT http://localhost:8080/users/1 \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Updated","last_name":"User","email":"updated@example.com","username":"updateduser"}'

# Delete a user
curl -X DELETE http://localhost:8080/users/1
```

## Traffic script

`traffic.sh` sends the standard requests: list users, create a user, update user 2 and list users again.

It targets proxymock's inbound proxy on port 4143 by default, so the requests are recorded; set `BASE_URL=http://localhost:8080` to call the app directly.

```bash
./traffic.sh          # or: make traffic
```

## Record with proxymock

Start proxymock with a Postgres listener on port 15432 that forwards to the real database on 5432:

```bash
proxymock record --map 15432=postgres://localhost:5432 --app-port 8080
```

In a second terminal, start the app pointed at proxymock's port instead of Postgres:

```bash
PGPORT=15432 go run .
```

Then send traffic through proxymock's inbound proxy on port 4143:

```bash
./traffic.sh
```

Stop proxymock with Ctrl-C.

The recording lands in `proxymock/recorded-<timestamp>/`, and `proxymock web` opens it.

## Showcase traffic for proxymock web's database views

The showcase is an opt-in set of `/showcase` endpoints that puts every kind of Postgres traffic proxymock web can display on the wire.

It is off by default: without `SHOWCASE` set, the app registers no extra routes, creates no extra tables and sends exactly the same queries as before.

Turn it on for both the app and the traffic script:

```bash
proxymock record --map 15432=postgres://localhost:5432 --app-port 8080

# second terminal
SHOWCASE=1 PGPORT=15432 go run .      # or: PGPORT=15432 make local-showcase

# third terminal
SHOWCASE=1 ./traffic.sh               # or: make traffic-showcase
```

The script checks every status code and exits non-zero if one is unexpected.

The showcase uses its own [pgx](https://github.com/jackc/pgx) connection pool rather than `lib/pq`.

pgx prepares each statement, learns the parameter types from Postgres, and then sends integer, numeric, boolean, timestamptz and bytea parameters in binary format, while `lib/pq` sends every parameter as text.

It works on three related tables, `showcase_customers`, `showcase_products` and `showcase_orders` (foreign keys to both), which are created on start-up and reset to the same seed rows by `POST /showcase/reset`.

| View | Request | Postgres traffic |
|---|---|---|
| Result set, multi-row, typed columns and NULLs | `GET /showcase/customers` | Simple-protocol `SELECT` with a RowDescription: NULL `nickname` and `avatar`, `numeric`, `boolean`, `bytea` and `timestamptz` columns |
| Result set, empty | `GET /showcase/customers?created_after=2030-01-01T00:00:00Z` | The same `SELECT` returning no rows, with its columns |
| Bound statement, binary numeric | `GET /showcase/products?min_price=5`, then `min_price=10000` | Bind with a binary `numeric` (OID 1700) parameter; three rows, then none |
| Bound statement, mixed types | `POST /showcase/customers` | `INSERT ... RETURNING id` binding text, NULL, binary `numeric`, `bool`, `bytea` and `timestamptz` parameters |
| Unique violation (23505) | `POST /showcase/customers` with an existing email | ErrorResponse 23505, returned as HTTP 409 |
| Check violation (23514) | `POST /showcase/customers` with a negative `credit_limit` | ErrorResponse 23514, returned as HTTP 422 |
| UPDATE, several rows then none | `POST /showcase/products/reprice` with `TEE-`, then `NOPE-` | `UPDATE 2`, then `UPDATE 0` |
| Transaction that commits | `POST /showcase/orders` | `BEGIN`, `SELECT` price, `INSERT ... RETURNING`, `COMMIT` |
| Transaction that rolls back | `POST /showcase/orders` with `"dry_run": true` | The same statements, then `ROLLBACK` |
| Foreign key violation (23503) | `POST /showcase/orders` for customer 999 | ErrorResponse 23503 inside the transaction, then `ROLLBACK`; HTTP 422 |
| N+1 queries | `GET /showcase/report` | One `SELECT` for the customers, then one per customer |
| DELETE | `DELETE /showcase/customers/4` | `DELETE 1` |
| Syntax error with a position (42601) | `GET /showcase/bad-query` | ErrorResponse 42601 with `position` 12; HTTP 400 |
