# proxymock Quick Start

## Install

```bash
sh -c "$(curl -Lfs https://downloads.speedscale.com/proxymock/install-proxymock)"
proxymock init   # authenticate with Speedscale cloud
```

## Capture (Record)

```bash
# Record traffic — proxymock launches your app and intercepts all I/O
proxymock record -- npm start

# If app talks to a database, map the DB port through the proxy:
proxymock record --map 15432=localhost:5432 -- npm start
# Then point your app at localhost:15432 instead of the real DB host

# Recordings land in proxymock/recorded-<timestamp>/
```

Inbound traffic arrives on `:4143`; outbound HTTP/HTTPS is intercepted via `:4140`.

## Configure outbound proxy (when launching app separately)

If you need to start your app yourself instead of via `proxymock record -- <cmd>`, set these env vars first:

```bash
export http_proxy=http://localhost:4140
export https_proxy=http://localhost:4140
export NODE_EXTRA_CA_CERTS="${HOME}/.speedscale/certs/tls.crt"  # Node.js
# Java: -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=4140
# Python: export REQUESTS_CA_BUNDLE="${HOME}/.speedscale/certs/tls.crt"
```

For database traffic over SOCKS5:

```bash
export all_proxy=socks5h://localhost:4140
```

## Send traffic through the proxy

```bash
# Send requests to :4143 (inbound proxy), not directly to your app
curl http://localhost:4143/api/health
```

## Inspect recorded traffic

```bash
# TUI browser for RRPair files
proxymock inspect --in proxymock/recorded-<timestamp>
```

## Create snapshot (push to cloud)

```bash
# Stop capture (Ctrl+C), then push recording to Speedscale Cloud:
proxymock cloud push snapshot

# To pull a snapshot back (e.g., after applying transforms in the UI):
proxymock cloud pull snapshot <SNAPSHOT_ID>
```

## Replay

```bash
# Without mocks (replay requests against real backends)
proxymock replay --test-against http://localhost:3000

# With performance gates
proxymock replay --test-against http://localhost:3000 \
  --fail-if "latency.p99 > 500" \
  --fail-if "requests.failed != 0"

# 10x load (10 virtual users)
proxymock replay --test-against http://localhost:3000 --vus 10

# With mocks (no real backends needed — start mock server first)
proxymock mock -- npm start
# then in another terminal:
proxymock replay --test-against http://localhost:3000
```

Results are printed directly in the terminal as a latency/throughput table.

---

> **AI benchmark:** An AI agent ran this entire workflow — install check, record 6 API endpoints, push snapshot to cloud, replay against a live target, view results — in **43 seconds** on a MacBook Pro (Node.js + MariaDB via Docker).
