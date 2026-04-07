# speedctl Quick Start

## Install

```bash
sh -c "$(curl -Lfs https://downloads.speedscale.com/speedctl/install)"
speedctl init   # authenticate with Speedscale cloud
```

## Capture

```bash
# Terminal 1: start capture proxy (inbound on :4143, outbound on :4140)
speedctl capture my-service 3000

# If app talks to a database, add --reverse-proxy:
speedctl capture my-service 3000 --reverse-proxy 15432=db-host:5432
# Then point your app at localhost:15432 instead of db-host:5432
```

## Configure outbound proxy

Set these before starting your app so outbound HTTP/HTTPS calls are captured:

```bash
export http_proxy=http://127.0.0.1:4140
export https_proxy=http://127.0.0.1:4140
export NODE_EXTRA_CA_CERTS="${HOME}/.speedscale/certs/tls.crt"  # Node.js
# Java: -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=4140
# Python: export REQUESTS_CA_BUNDLE="${HOME}/.speedscale/certs/tls.crt"
```

## Send traffic through the proxy

```bash
# Terminal 2: start your app with proxy vars set
npm start  # or java -jar app.jar, python app.py, etc.

# Terminal 3: send requests to :4143 (not directly to your app)
curl http://localhost:4143/api/health
```

## Create snapshot

```bash
# Stop capture (Ctrl+C), wait ~60s, then:
speedctl create snapshot --name "my-capture" --service my-service --start 30m
speedctl wait snapshot <SNAPSHOT_ID> --timeout 5m
```

## Replay

```bash
# Without mocks (real backends)
speedctl replay <SNAPSHOT_ID> --test-against http://localhost:3000 --mode tests-only

# With mocks (no real backends needed -- set proxy vars first)
speedctl replay <SNAPSHOT_ID> --test-against http://localhost:3000 --mode full-replay
```

View results in the [Speedscale dashboard](https://app.speedscale.com).
