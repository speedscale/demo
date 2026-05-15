# Multi-User Shift Demo Tutorial (One Doc, 3 Options)

This tutorial is customer-facing and shows one core use case:

- record authenticated traffic in one environment
- replay the same traffic in another environment
- optionally swap login credentials at replay time

It supports three execution styles in this single document:

1. Interactive with proxymock web
2. Headless with CLI
3. Headless with an agent using MCP proxymock calls

## What the demo proves

- Capture: HTTP + MariaDB traffic recorded together
- Portability: recording can be copied to another machine/location
- Replay safety: replay against non-prod target (`--test-against`)
- Concurrency: `--vus 10 --times 3`
- Credentials remap: Basic auth values swapped with `credentials-basic`

## Demo architecture

- App: Node API on `:3001`
- DB: MariaDB TLS on `:3306`
- Gateway: KrakenD on `:8080`
- proxymock inbound proxy: `:4143`
- proxymock DB map port: `:13306`

## Prerequisites

```bash
cd demo/node-mariadb
make certs
make infra
npm install
```

Install proxymock if needed:

```bash
sh -c "$(curl -Lfs https://downloads.speedscale.com/proxymock/install-proxymock)"
```

---

## Shared Step 1 - Record in Environment A

Terminal A:

```bash
OUT_DIR="proxymock/captured-$(date +%Y%m%d-%H%M%S)"
echo "$OUT_DIR"

proxymock record \
  --app-port 3001 \
  --map 13306=localhost:3306 \
  --out "$OUT_DIR" \
  --svc-name node-mariadb-demo
```

Terminal B:

```bash
DB_HOST=127.0.0.1 DB_PORT=13306 DB_SSL_CA=./certs/ca.pem PORT=3001 node server.js
```

Terminal C:

```bash
LOGIN_AUTH_MODE=basic ./generate-users-traffic.sh 4143
```

When traffic generation is done:

- stop terminal A (`Ctrl-C`) to finalize recording
- stop terminal B

## Shared Step 2 - Simulate moving capture to Environment B

Use one of these patterns.

Local copy (same machine, different workspace):

```bash
DEST_BASE="/tmp/proxymock-env-b"
mkdir -p "$DEST_BASE"
cp -R "$OUT_DIR" "$DEST_BASE/"
```

Remote copy (different machine):

```bash
rsync -av "$OUT_DIR" user@env-b-host:/path/to/workspace/proxymock/
```

From here on, assume Environment B uses:

```bash
ENV_B_IN="/tmp/proxymock-env-b/$(basename "$OUT_DIR")"
```

---

## Option 1 - Interactive with proxymock web

### 1) Start app in Environment B

```bash
DB_HOST=127.0.0.1 DB_PORT=3306 DB_SSL_CA=./certs/ca.pem PORT=3001 node server.js
```

### 2) Open UI

```bash
proxymock web
```

### 3) Generate credential swap via UI

In Requests:

1. select captured run (`captured-...`)
2. click Automations
3. choose Basic auth credentials swap
4. edit dataframe values, for example:
   - `aurora -> basil / brisk-morning`
   - `basil -> clover / coffee-break`
5. save

### 4) Replay from UI

In Replay:

1. target: `http://localhost:3001`
2. VUs: `10`
3. times: `3`
4. run replay

### 5) Verify

- replay run shows no failed requests
- replayed `POST /login` requests show remapped Basic auth headers

---

## Option 2 - Headless CLI

### 1) Ensure snapshot metadata exists in Environment B workspace

For fresh workspaces, initialize metadata once:

```bash
proxymock web
```

Stop it after startup. This creates `.metadata/snapshot.json` for blueprint binding.

### 2) Generate credentials swap mapping

```bash
proxymock automation credentials-basic \
  --in "$ENV_B_IN" \
  --replay-user aurora=basil \
  --replay-pass aurora=brisk-morning \
  --replay-user basil=clover \
  --replay-pass basil=coffee-break \
  --output json
```

### 3) Start app in Environment B

```bash
DB_HOST=127.0.0.1 DB_PORT=3306 DB_SSL_CA=./certs/ca.pem PORT=3001 node server.js
```

### 4) Replay with concurrency

```bash
proxymock replay \
  --in "$ENV_B_IN" \
  --test-against http://localhost:3001 \
  --vus 10 \
  --times 3 \
  --fail-if "requests.failed != 0"
```

### 5) Validate

```bash
proxymock inspect --in proxymock/results/replayed-<timestamp>
grep -r "Authorization: Basic" proxymock/results/replayed-<timestamp>/
```

---

## Option 3 - Headless with Agent + MCP calls

Use this when an AI agent is orchestrating proxymock tools directly.

### Suggested MCP sequence

1. `proxymock_record_traffic_start`
   - `app-port: "3001"`
   - `proxy-in-port: "4143"`
   - `out-directory: ["proxymock/captured-<ts>"]`
2. Agent runs app with `DB_PORT=13306`
3. Agent runs `generate-users-traffic.sh 4143`
4. `proxymock_record_traffic_stop`
5. Copy capture directory to Environment B path
6. Agent initializes metadata (`proxymock web` startup) if needed
7. Agent executes:
   - `proxymock automation credentials-basic --in <env-b-capture> ...`
8. Agent runs app with `DB_PORT=3306`
9. `proxymock_replay_traffic`
   - `in-directory: ["<env-b-capture>"]`
   - `test-against: "http://localhost:3001"`
10. Agent validates replay logs and result files

### MCP-specific validation targets

- replay exit success
- no failed requests
- remapped Basic auth visible in replayed login requests

---

## Troubleshooting

### `no snapshot binding ... replay will run without blueprints`

Cause: workspace metadata missing.

Fix:

```bash
proxymock web
```

Then rerun automation/replay.

### App cannot connect to DB during record

Wait until proxymock map port `13306` is listening before starting app.

### 401s during replay

- ensure captured login used Basic auth (`LOGIN_AUTH_MODE=basic`)
- verify replay credential mappings are valid in target environment
- verify replay target URL is correct

## Cleanup

```bash
make down
```
