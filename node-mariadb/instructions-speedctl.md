# speedctl Quick Start (KrakenD + systemd Node + MariaDB)

This guide is for environments where Node runs as a service (not directly via `npm`), KrakenD is the gateway, and MariaDB/MySQL is used per tenant.

## Install

```bash
sh -c "$(curl -Lfs https://downloads.speedscale.com/speedctl/install)"

# If speedctl is not found immediately, reload your shell profile
# (pick the one your shell uses)
source ~/.zshrc 2>/dev/null || true
source ~/.bashrc 2>/dev/null || true

speedctl init
```

## 1) Start capture

```bash
# Node listens on 3001
speedctl capture my-service 3001

# Single DB host
speedctl capture my-service 3001 \
  --reverse-proxy 13306=db-host.internal:3306

# Multi-tenant pool-cluster (repeat --reverse-proxy per DB host)
speedctl capture my-service 3001 \
  --reverse-proxy 13306=tenant-a-db.internal:3306 \
  --reverse-proxy 13307=tenant-b-db.internal:3306
```

While capture is running:

- Route KrakenD backend to `http://127.0.0.1:4143`
- Point Node DB settings to mapped ports (`13306`, `13307`, ...)
- Keep MariaDB TLS enabled (`DB_SSL_CA` set) if upstream requires secure transport

## 2) Configure service environment (systemd)

`speedctl` captures outbound HTTP/HTTPS via proxy env vars, plus DB traffic via `--reverse-proxy` mapping.

```bash
sudo systemctl edit <node-service>

# Add:
[Service]
Environment="http_proxy=http://127.0.0.1:4140"
Environment="https_proxy=http://127.0.0.1:4140"
Environment="NODE_EXTRA_CA_CERTS=/root/.speedscale/certs/tls.crt"
Environment="DB_HOST=127.0.0.1"
Environment="DB_PORT=13306"
Environment="DB_SSL_CA=/var/www/<api_url>/certs/ca.pem"

sudo systemctl daemon-reload
sudo systemctl restart <node-service>
```

## 3) Generate traffic

Send requests through normal ingress (KrakenD/public endpoint):

```bash
curl -k https://<gateway-host>/health
curl -k https://<gateway-host>/products
```

## 4) Create snapshot

```bash
# Stop capture first, then create snapshot from recent traffic window
speedctl create snapshot --name "my-capture" --service my-service --start 30m
speedctl wait snapshot <SNAPSHOT_ID> --timeout 5m
```

## 5) Replay

Before replay, restore normal routing:

- KrakenD backend -> `http://127.0.0.1:3001`
- Node DB port -> real DB (`3306`) for tests-only replay

```bash
# Replay against live backends
speedctl replay <SNAPSHOT_ID> \
  --test-against http://localhost:3001 \
  --mode tests-only

# Replay with mocks
speedctl replay <SNAPSHOT_ID> \
  --test-against http://localhost:3001 \
  --mode full-replay
```

View replay results in the [Speedscale dashboard](https://app.speedscale.com).
