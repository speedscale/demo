# proxymock Quick Start (Gateway + systemd + MySQL)

Use this when your app is started by systemd/ansible (not `npm start`), is behind a gateway (KrakenD, NGINX, etc.), and talks to MySQL/MariaDB.

## Install

```bash
sh -c "$(curl -Lfs https://downloads.speedscale.com/proxymock/install-proxymock)"

# If proxymock is not found immediately, reload your shell profile
# (pick the one your shell uses)
source ~/.zshrc 2>/dev/null || true
source ~/.bashrc 2>/dev/null || true

proxymock init
```

## Variables (set for your environment)

```bash
APP_PORT=3001
GATEWAY_URL=https://<gateway-host>
DB_UPSTREAM_PORT=3306
DB_MAP_PORT=13306
```

## 1) Record traffic

Start proxymock in one terminal:

```bash
# Single DB host
proxymock record \
  --app-port ${APP_PORT} \
  --map ${DB_MAP_PORT}=<db-host>:${DB_UPSTREAM_PORT} \
  --out proxymock/recorded-$(date +%Y%m%d-%H%M%S)

# Multi-tenant / pool-cluster example (repeat --map)
proxymock record \
  --app-port ${APP_PORT} \
  --map 13306=<tenant-a-db-host>:3306 \
  --map 13307=<tenant-b-db-host>:3306 \
  --out proxymock/recorded-$(date +%Y%m%d-%H%M%S)
```

While recording:

- Point gateway upstream to `http://127.0.0.1:4143`
- Point app DB connection to mapped local port(s) like `13306`
- Keep DB TLS enabled if your upstream DB enforces secure transport

For systemd apps, apply temporary env overrides:

```bash
sudo systemctl edit <app-service>

# Add:
[Service]
Environment="DB_HOST=127.0.0.1"
Environment="DB_PORT=13306"
Environment="DB_SSL_CA=/path/to/ca.pem"

sudo systemctl daemon-reload
sudo systemctl restart <app-service>
```

Generate traffic through the normal gateway URL:

```bash
curl -k ${GATEWAY_URL}/health
curl -k ${GATEWAY_URL}/<api-path>
```

Stop recording with `Ctrl+C`.

## 2) Inspect

```bash
proxymock inspect --in proxymock/recorded-<timestamp>
```

## 3) Replay against real backends

Before replay, restore normal routing:

- gateway upstream back to app (`127.0.0.1:${APP_PORT}`)
- app DB port back to real DB port (`3306` typically)
- DB TLS settings restored

```bash
proxymock replay \
  --in proxymock/recorded-<timestamp> \
  --test-against http://localhost:${APP_PORT} \
  --fail-if "requests.failed != 0"
```

Optional SLO gates:

```bash
proxymock replay \
  --in proxymock/recorded-<timestamp> \
  --test-against http://localhost:${APP_PORT} \
  --fail-if "latency.p99 > 500" \
  --fail-if "requests.failed != 0"
```

## 4) Replay with mocked DB (optional)

```bash
proxymock mock \
  --in proxymock/recorded-<timestamp> \
  --map 3306=mysql://<db-host>:3306 \
  --out proxymock/mocked-$(date +%Y%m%d-%H%M%S)
```

Then run your app against local mock DB (`127.0.0.1:3306`) and replay again.

Note: if DB traffic was captured as end-to-end TLS, protocol-level DB mocking may not work. In that case, rely on replay against real backends.

## Cloud snapshot (optional)

```bash
proxymock cloud push snapshot
proxymock cloud pull snapshot <SNAPSHOT_ID>
```
