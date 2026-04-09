# proxymock Quick Start (Gateway + systemd + MySQL)

Use this when your app is managed outside proxymock (systemd/ansible), sits behind a gateway, and uses MySQL/MariaDB.

## Setup

1) Install proxymock:

```bash
sh -c "$(curl -Lfs https://downloads.speedscale.com/proxymock/install-proxymock)"
source ~/.zshrc 2>/dev/null || true
source ~/.bashrc 2>/dev/null || true
proxymock init
```

2) Ensure you already have the DB CA certificate path used by your app (if DB requires TLS).

TLS trust model (important):

- DB traffic (`--map ...:3306`) keeps using your existing DB trust chain; keep your current DB CA path configured.
- You do **not** switch DB CA to a proxymock CA for MySQL/MariaDB mapping.
- If you also proxy outbound HTTP/HTTPS via `:4140`, your app must trust proxymock's local CA:

```bash
export NODE_EXTRA_CA_CERTS=${HOME}/.speedscale/certs/tls.crt
```

3) Set shared variables:

```bash
APP_PORT=3001
GATEWAY_URL=https://<gateway-host>
```

## Phase 1 (Inbound Only)

Goal: capture inbound HTTP only first, with no outbound mapping.

Start capture:

```bash
proxymock record \
  --app-port ${APP_PORT} \
  --out proxymock/recorded-inbound-$(date +%Y%m%d-%H%M%S)
```

During capture:

- point gateway upstream to `http://127.0.0.1:4143`
- keep app DB settings unchanged
- send traffic through normal gateway URL

```bash
curl -k ${GATEWAY_URL}/health
curl -k ${GATEWAY_URL}/<api-path>
```

Stop capture (`Ctrl+C`) and replay:

```bash
proxymock replay \
  --in proxymock/recorded-inbound-<timestamp> \
  --test-against http://localhost:${APP_PORT} \
  --fail-if "requests.failed != 0"
```

## Phase 2 (Inbound + Outbound)

Goal: capture inbound HTTP plus outbound DB (and optional outbound HTTP/HTTPS).

Start capture with DB mapping:

```bash
# single DB host
proxymock record \
  --app-port ${APP_PORT} \
  --map 13306=<db-host>:3306 \
  --out proxymock/recorded-inout-$(date +%Y%m%d-%H%M%S)

# multi-tenant / pool-cluster (repeat --map)
proxymock record \
  --app-port ${APP_PORT} \
  --map 13306=<tenant-a-db-host>:3306 \
  --map 13307=<tenant-b-db-host>:3306 \
  --out proxymock/recorded-inout-$(date +%Y%m%d-%H%M%S)
```

Update app runtime during capture:

- DB host -> `127.0.0.1`
- DB port -> mapped local port (`13306`, `13307`, ...)
- keep DB TLS enabled if upstream DB enforces secure transport

Systemd example:

```bash
sudo systemctl edit <app-service>

# Add:
[Service]
Environment="DB_HOST=127.0.0.1"
Environment="DB_PORT=13306"
Environment="DB_SSL_CA=/path/to/your-db-ca.pem"

sudo systemctl daemon-reload
sudo systemctl restart <app-service>
```

Optional outbound HTTP/HTTPS capture from app process:

```bash
export http_proxy=http://127.0.0.1:4140
export https_proxy=http://127.0.0.1:4140
export NODE_EXTRA_CA_CERTS=${HOME}/.speedscale/certs/tls.crt
```

Stop capture (`Ctrl+C`) and replay:

```bash
proxymock replay \
  --in proxymock/recorded-inout-<timestamp> \
  --test-against http://localhost:${APP_PORT} \
  --fail-if "requests.failed != 0"
```

## Appendix

Inspect capture:

```bash
proxymock inspect --in proxymock/recorded-<timestamp>
```

Optional cloud push/pull:

```bash
proxymock cloud push snapshot
proxymock cloud pull snapshot <SNAPSHOT_ID>
```

DB mock note:

- if DB wire traffic is captured as end-to-end TLS, protocol-level DB mocking may not work
- use replay against real backends as the primary gate in that case
