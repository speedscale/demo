# .NET Orders Service

An ASP.NET Core 8 minimal-API service that demonstrates a simple order create-and-confirm flow. It is designed to showcase Speedscale proxymock's `smart_replace_recorded` transform: when you record the `POST /orders` → `POST /orders/confirm` flow, proxymock detects that the UUID order id returned by the first call is reused in the second call's request body, and automatically recommends a transform.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/healthz` | Health check |
| `GET` | `/orders` | List all orders |
| `POST` | `/orders` | Create an order; returns a new UUID v4 `orderId` |
| `POST` | `/orders/confirm` | Confirm an order by `orderId` in the request body |

### POST /orders

Request (all fields optional):
```json
{ "item": "widget", "quantity": 2 }
```

Response `201 Created`:
```json
{
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "created",
  "item": "widget",
  "quantity": 2,
  "createdAt": "2024-01-01T12:00:00.000Z"
}
```

### POST /orders/confirm

Request:
```json
{ "orderId": "550e8400-e29b-41d4-a716-446655440000" }
```

Response `200 OK`:
```json
{
  "orderId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "confirmed",
  "confirmedAt": "2024-01-01T12:00:05.000Z"
}
```

## Quick Start

### Docker Compose

```bash
docker compose up -d
```

Service is available at `http://localhost:8082`.

### Run Locally

Requires .NET 8 SDK. No Docker needed — the app listens on `:8082` by default
(set via `Urls` in `appsettings.json`), so a plain `dotnet run` matches the
scripts.

```bash
dotnet run        # or: make local  — both listen on :8082
```

### Make Targets

```bash
make help          # list all targets
make build         # dotnet build
make local         # run locally on port 8082 (plain dotnet run)
make record        # record the order flow with proxymock (launches the app too)
make test-capture  # drive the flow through the recorder (while 'make record' is up)
make up            # docker compose up -d
make down          # docker compose down
make docker-build  # build Docker image
make test-api      # run scripts/test.sh
make health        # curl /healthz
make kube          # kubectl apply k8s/base/
make kube-clean    # kubectl delete k8s/base/
```

## Demo Flow

Run `scripts/test.sh` to exercise the full create→confirm flow:

```bash
./scripts/test.sh                   # defaults to localhost:8082
./scripts/test.sh localhost:8082    # explicit host
```

The script:
1. `POST /orders` — captures the `orderId` from the response
2. `POST /orders/confirm` — sends that same `orderId` in the request body
3. `GET /orders` — lists all orders

### Record it with proxymock (two windows)

`make record` launches the app *and* the recorder together, so you don't need a
separate window for the app:

```bash
# window 1 — app + recorder (Ctrl-C to stop recording)
make record

# window 2 — drive the flow through the recorder
make test-capture

# then view the recommendation
proxymock web
```

The UUID round-trip triggers a `smart_replace_recorded` "Correlated ID"
recommendation in `proxymock web`.

## Storage

Orders are kept in memory only. The store is reset when the process restarts — no database required.

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `ASPNETCORE_URLS` | `http://+:8082` | Listen address |
| `ASPNETCORE_ENVIRONMENT` | `Production` | Runtime environment |
