# Go MySQL Demo App

A small Go REST API for users and their orders, backed by MySQL 8.4.

It exists to exercise proxymock's MySQL support: capture, mocking and replay, including server-side prepared statements.

## What it sends to MySQL

The app uses `github.com/go-sql-driver/mysql` with `interpolateParams=false`, which is the driver default.

With that setting, every query that has arguments goes over the wire as a server-side prepared statement: `COM_STMT_PREPARE`, then `COM_STMT_EXECUTE`, then `COM_STMT_CLOSE`.

Between them, the endpoints cover these statement kinds:

| Endpoint | MySQL traffic |
|---|---|
| `GET /health` | `SELECT VERSION()` with no arguments, sent as a plain text-protocol `COM_QUERY` |
| `GET /users`, `GET /users/{id}` | Parameterised `SELECT` (prepared statement) |
| `POST /users` | `INSERT` with an `AUTO_INCREMENT` id; a duplicate email or username returns MySQL error 1062 |
| `PUT /users/{id}`, `DELETE /users/{id}` | Parameterised `UPDATE` and `DELETE` |
| `POST /users/{id}/orders` | Explicit transaction: `BEGIN`, `INSERT` into `orders`, `UPDATE users.order_count`, `COMMIT` |
| `GET /users/{id}/orders` | `SELECT` with a `LEFT JOIN` from `users` to `orders` |

## Prerequisites

- Go 1.25 or later
- Docker, for MySQL (or any MySQL 8.x server you can reach)
- [proxymock](https://docs.speedscale.com/proxymock/getting-started/installation/), for the record, mock and replay steps

## Configuration

Connection settings come from environment variables:

| Variable | Default |
|---|---|
| `MYSQL_HOST` | `127.0.0.1` |
| `MYSQL_PORT` | `3306` |
| `MYSQL_USER` | `demo` |
| `MYSQL_PWD` | `demo` |
| `MYSQL_DATABASE` | `app` |

The API always listens on port 8080.

On start-up the app creates the `users` and `orders` tables if they do not exist.

If `users` is empty, it seeds five users and two orders for user 1.

## Run with docker compose

This starts MySQL 8.4 and the app together:

```bash
docker compose up --build
```

The app waits for the MySQL healthcheck before it starts.

Stop everything and delete the data volume with:

```bash
docker compose down -v
```

## Run locally

Start only the MySQL service from the compose file:

```bash
docker compose up -d mysql
```

Then run the app on your machine:

```bash
go run .
```

The defaults match the compose file, so no environment variables are needed.

## API Endpoints

- `GET /health` - Health check that reports the MySQL version
- `GET /users` - List users (optional `?limit=N`, default 100)
- `GET /users/{id}` - Get a user by ID
- `POST /users` - Create a user (returns 409 if the email or username exists)
- `PUT /users/{id}` - Update a user by ID
- `DELETE /users/{id}` - Delete a user and their orders
- `POST /users/{id}/orders` - Place an order and bump the user's `order_count`
- `GET /users/{id}/orders` - List a user's orders

## Schema

`users`: `id` (AUTO_INCREMENT), `first_name`, `last_name`, `email` (unique), `username` (unique), `age`, `order_count`.

`orders`: `id` (AUTO_INCREMENT), `user_id` (foreign key to `users`, cascade delete), `total` (DECIMAL(10,2)), `created_at` (DATETIME).

## Example Usage

```bash
# Health check
curl http://localhost:8080/health

# List users
curl http://localhost:8080/users

# Get one user
curl http://localhost:8080/users/1

# Create a user
curl -X POST http://localhost:8080/users \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Test","last_name":"User","email":"test@example.com","username":"testuser","age":40}'

# Create the same user again: 409 Conflict
curl -i -X POST http://localhost:8080/users \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Test","last_name":"User","email":"test@example.com","username":"testuser","age":40}'

# Update a user
curl -X PUT http://localhost:8080/users/2 \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Jane","last_name":"Smith","email":"jane.smith@example.com","username":"janesmith","age":29}'

# Place an order
curl -X POST http://localhost:8080/users/2/orders \
  -H "Content-Type: application/json" \
  -d '{"total":99.95}'

# List a user's orders
curl http://localhost:8080/users/2/orders

# Delete a user
curl -X DELETE http://localhost:8080/users/5
```

`test_requests.http` has the same requests, plus the error cases, for the VS Code REST Client or JetBrains HTTP client.

## Record, mock and replay with proxymock

Start MySQL first, for example with `docker compose up -d mysql`.

### Record

Start proxymock with a MySQL listener on port 13306 that forwards to the real database on 3306:

```bash
proxymock record --map 13306=localhost:3306 --app-port 8080
```

In a second terminal, start the app pointed at proxymock's port instead of MySQL:

```bash
MYSQL_PORT=13306 go run .
```

proxymock's inbound proxy listens on port 4143 and forwards to the app on 8080.

Send requests through it so both the API calls and the MySQL calls are recorded:

```bash
curl http://localhost:4143/health
curl http://localhost:4143/users
curl http://localhost:4143/users/1
curl -X POST http://localhost:4143/users/1/orders -H "Content-Type: application/json" -d '{"total":12.50}'
curl http://localhost:4143/users/1/orders
```

`./traffic.sh` (or `make traffic`) sends the same five requests.

Stop proxymock with Ctrl-C.

The recording lands in `proxymock/recorded-<timestamp>/`.

The MySQL RRPairs include `StatementPrepare` and `StatementExecute` entries for the parameterised queries, and a plain query for `/health`.

### Mock

Stop MySQL (for example `docker compose stop mysql`), then serve the recorded MySQL responses from proxymock instead:

```bash
proxymock mock --map 13306=localhost:3306
```

`proxymock mock` reads the recordings under the current directory.

The `--map` flag makes the mock server listen on port 13306 again, so the app config does not change.

Start the app against it:

```bash
MYSQL_PORT=13306 go run .
```

The app now runs with no real database behind it.

### Replay

With the app running, replay the recorded inbound API traffic against it and compare the responses:

```bash
proxymock replay --test-against http://localhost:8080
```

### Load test the database

You can also replay only the recorded MySQL traffic straight at a MySQL server, with no app involved:

```bash
MYSQL_USER=demo MYSQL_PWD=demo proxymock replay \
  --tests-filter '(direction IS OUT) AND (tech IS MySQL)' \
  --test-against mysql://localhost:3306/app \
  --vus 10 --for 30s
```

`MYSQL_USER` and `MYSQL_PWD` give proxymock the credentials to log in to the target database.

This needs a proxymock release that includes MySQL replay.

Expect two kinds of result mismatch, both on purpose:

- `1062 Duplicate entry` on `INSERT INTO users`, because every virtual user replays the same recorded usernames. The guide's `mysql_param` blueprint regenerates them.
- `1213 Deadlock found` on the checkout's `UPDATE users SET order_count`. Concurrent checkouts for one user insert an order, which locks the user row through the foreign key, and then update that row. The demo leaves this in so the load test has a real finding to show: a production app would retry the transaction or lock the row first.

For the full walkthrough, see the [MySQL load testing guide](https://docs.speedscale.com/proxymock/guides/mysql-load-testing/).

## Showcase traffic for proxymock web's database views

The showcase is an opt-in set of `/showcase` endpoints that puts every kind of MySQL traffic proxymock web can display on the wire.

It is off by default: without `SHOWCASE` set, the app registers no extra routes, creates no extra tables, opens no extra connections and sends exactly the same queries as before.

Turn it on for both the app and the traffic script:

```bash
proxymock record --map 13306=localhost:3306 --app-port 8080

# second terminal
SHOWCASE=1 MYSQL_PORT=13306 go run .   # or: MYSQL_PORT=13306 make local-showcase

# third terminal
SHOWCASE=1 ./traffic.sh                # or: make traffic-showcase
```

The script checks every status code and exits non-zero if one is unexpected.

The showcase uses its own connection pool, opened with `multiStatements=true` so that one `COM_QUERY` can return two result sets.

The default pool is unchanged, so the default handshake and capability flags stay the same.

It works on three related tables, `showcase_customers`, `showcase_products` and `showcase_orders` (foreign keys to both), which are created on start-up and reset to the same seed rows by `POST /showcase/reset`.

| View | Request | MySQL traffic |
|---|---|---|
| Result set, multi-row, typed columns and NULLs | `GET /showcase/customers` | Text-protocol `COM_QUERY`: NULL `nickname` and `avatar`, `DECIMAL`, `BOOLEAN`, `BLOB` and `DATETIME` columns |
| Multiple result sets | `GET /showcase/customers/1/summary` | One `COM_QUERY` with two `SELECT`s: the customer, then their two orders |
| Multiple result sets, second one empty | `GET /showcase/customers/3/summary` | The same, with an empty orders result set |
| Prepared statement, result set then empty | `GET /showcase/products?min_price=5`, then `min_price=10000` | `COM_STMT_EXECUTE` with a `DOUBLE` parameter; three rows, then none |
| Prepared statement, mixed types | `POST /showcase/customers` | `INSERT` binding string, NULL, `DOUBLE`, `TINY` (boolean), blob bytes and a timestamp string; OK packet with the new id |
| Duplicate key (1062) | `POST /showcase/customers` with an existing email | ERR 1062, returned as HTTP 409 |
| Check constraint (3819) | `POST /showcase/customers` with a negative `credit_limit` | ERR 3819, returned as HTTP 422 |
| UPDATE, several rows then none | `POST /showcase/products/reprice` with `TEE-`, then `NOPE-` | OK packets with 2, then 0, affected rows |
| Transaction that commits | `POST /showcase/orders` | `START TRANSACTION`, `SELECT` price, `INSERT`, `COMMIT` |
| Transaction that rolls back | `POST /showcase/orders` with `"dry_run": true` | The same statements, then `ROLLBACK` |
| Foreign key failure (1452) | `POST /showcase/orders` for customer 999 | ERR 1452 inside the transaction, then `ROLLBACK`; HTTP 422 |
| N+1 queries | `GET /showcase/report` | One `SELECT` for the customers, then one prepared `SELECT` per customer |
| DELETE | `DELETE /showcase/customers/4` | OK packet with 1 affected row |
| Syntax error (1064) | `GET /showcase/bad-query` | ERR 1064; HTTP 400 |

The Go driver sends `time.Time` parameters as strings and has no way to send a `DECIMAL` parameter, so the timestamp goes over the wire as a string value and the credit limit as a `DOUBLE`.

A stored procedure `CALL` would be the other way to get several result sets, but its response ends with an extra OK packet that proxymock's MySQL recorder currently misreads, which corrupts the rest of that connection's recording, so the showcase uses a multi-statement query instead.
