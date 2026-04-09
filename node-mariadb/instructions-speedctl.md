# speedctl Quick Start (Gateway + systemd + MySQL)

Use this when your app is managed by systemd/ansible, fronted by a gateway, and backed by MySQL/MariaDB.

## Setup

1) Install speedctl:

```bash
sh -c "$(curl -Lfs https://downloads.speedscale.com/speedctl/install)"
source ~/.zshrc 2>/dev/null || true
source ~/.bashrc 2>/dev/null || true
speedctl init
```

2) Ensure DB TLS certs exist (if DB requires TLS):

```bash
# from node-mariadb/
make certs
# or
./gen-certs.sh
```

3) Set shared variables:

```bash
SERVICE_NAME=my-service
APP_PORT=3001
GATEWAY_URL=https://<gateway-host>
```

## Phase 1 (Inbound Only)

Goal: start with inbound HTTP capture only.

Start capture:

```bash
speedctl capture ${SERVICE_NAME} ${APP_PORT}
```

During capture:

- point gateway upstream to `http://127.0.0.1:4143`
- keep app DB settings unchanged
- generate traffic through normal gateway URL

```bash
curl -k ${GATEWAY_URL}/health
curl -k ${GATEWAY_URL}/<api-path>
```

Stop capture, then create snapshot:

```bash
speedctl create snapshot --name "inbound-capture" --service ${SERVICE_NAME} --start 30m
speedctl wait snapshot <SNAPSHOT_ID> --timeout 5m
```

Replay:

```bash
speedctl replay <SNAPSHOT_ID> \
  --test-against http://localhost:${APP_PORT} \
  --mode tests-only
```

## Phase 2 (Inbound + Outbound)

Goal: add outbound capture for DB (and optional outbound HTTP/HTTPS).

Start capture with DB reverse-proxy mapping:

```bash
# single DB host
speedctl capture ${SERVICE_NAME} ${APP_PORT} \
  --reverse-proxy 13306=<db-host>:3306

# multi-tenant / pool-cluster
speedctl capture ${SERVICE_NAME} ${APP_PORT} \
  --reverse-proxy 13306=<tenant-a-db-host>:3306 \
  --reverse-proxy 13307=<tenant-b-db-host>:3306
```

Update app runtime during capture:

- DB host -> `127.0.0.1`
- DB port -> mapped local port (`13306`, `13307`, ...)
- keep DB TLS enabled if upstream DB requires secure transport

Systemd example:

```bash
sudo systemctl edit <app-service>

# Add:
[Service]
Environment="DB_HOST=127.0.0.1"
Environment="DB_PORT=13306"
Environment="DB_SSL_CA=/path/to/ca.pem"
Environment="http_proxy=http://127.0.0.1:4140"
Environment="https_proxy=http://127.0.0.1:4140"

sudo systemctl daemon-reload
sudo systemctl restart <app-service>
```

Stop capture, then create snapshot:

```bash
speedctl create snapshot --name "inbound-outbound-capture" --service ${SERVICE_NAME} --start 30m
speedctl wait snapshot <SNAPSHOT_ID> --timeout 5m
```

Replay:

```bash
speedctl replay <SNAPSHOT_ID> \
  --test-against http://localhost:${APP_PORT} \
  --mode tests-only
```

## Appendix

Before replay, restore normal routing:

- gateway upstream back to app (`127.0.0.1:${APP_PORT}`)
- app DB port back to real DB port (typically `3306`)

For full mocked replay mode:

```bash
speedctl replay <SNAPSHOT_ID> \
  --test-against http://localhost:${APP_PORT} \
  --mode full-replay
```

View results in the [Speedscale dashboard](https://app.speedscale.com).
