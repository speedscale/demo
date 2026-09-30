# Tutorial orders service (Go)

The Go port of the proxymock getting-started service: a small CNCF swag shop backed by Postgres and the hosted CNCF projects API.

## Prerequisites

* Go 1.25 or newer
* Docker, for Postgres
* [proxymock](https://docs.speedscale.com/proxymock/) for the recording step

## Run it

Start Postgres, from the `tutorial/` directory:

```sh
docker compose up -d
```

Run the app, from `tutorial/go/`:

```sh
go run .
```

Run the tests (no database needed):

```sh
go test ./...
```

Drive traffic at the app in a second terminal:

```sh
go run ./cmd/traffic
```

Configuration is by environment variables, listed in [`../contract/SPEC.md`](../contract/SPEC.md) along with the full behavior contract.

## Record it with proxymock

```sh
DATABASE_URL=postgres://tutorial:tutorial@localhost:15432/tutorial?sslmode=disable proxymock record --map 15432=postgres://localhost:5432 -- go run .
```

Then, in a second terminal:

```sh
go run ./cmd/traffic http://localhost:4143
```
