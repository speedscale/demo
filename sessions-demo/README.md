# Sessions Demo

A small HTTP API whose traffic, when recorded with `proxymock record`, produces a
**rich set of sessions** — exactly what the proxymock **Sessions** report view is
built to analyze.

proxymock derives an RRPair's `session` from the inbound `Authorization` header
(and from the `access_token` in a login response). This demo deliberately
exercises every scheme the detector understands, driven by many distinct actors
running multi-step journeys with think-time, so one short recording yields a
varied, realistic session set.

| Auth scheme | Recorded session id | Example actors |
|---|---|---|
| JWT bearer with a `uid` claim | the `uid` (an email) | `alice@example.com`, `bob@example.com`, … |
| HTTP Basic | the username | `ops-admin`, `support-agent` |
| Opaque bearer (API key) | the token string | `sk_live_billing_7f3a91`, `sk_live_analytics_2b8c44` |
| No auth (`/health`) | — (unattributed bucket) | anonymous |

The journeys also produce **errors** (a 403 from a customer hitting `/admin`, a
404 for a missing product, a 500 from the `p-broken` item) so the session-level
SLO, error-rate, and latency columns have something to show.

## Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | none | unattributed |
| POST | `/login` | none | returns a JWT (`uid` = email) |
| GET | `/catalog` | any | product list |
| GET | `/catalog/:id` | any | `p-broken` → 500, unknown → 404 |
| GET | `/cart` · POST `/cart/items` | any | per-session cart |
| POST | `/orders` · GET `/orders/:id` | any | 400 empty cart, 403 not owner, 404 missing |
| GET | `/account` | any | echoes the resolved identity |
| GET | `/admin/metrics` | admin/service | 403 otherwise |
| POST | `/logout` | any | 204 |

## Run it

Requires Node 18+ (uses the built-in `fetch`); no dependencies to install.

### Plain smoke test (no recording)

```bash
npm start                                            # terminal 1 — app on :3000
BASE=http://localhost:3000 SESSIONS=30 npm run drive # terminal 2 — drives traffic
```

### Record a rich session set

```bash
# terminal 1 — proxymock launches the app as a child; inbound proxy on :4143
proxymock record --app-port 3000 -- npm start

# terminal 2 — drive traffic THROUGH the proxy so it's captured
BASE=http://localhost:4143 npm run drive
```

By default the driver generates **~1000 sessions** (9 flagship personas across
JWT/Basic/API-key auth, plus synthetic JWT actors) so you can test the Sessions
view at scale. Tune it with env vars:

| Var | Default | Meaning |
|---|---|---|
| `SESSIONS` | `1000` | total distinct sessions to generate |
| `CONCURRENCY` | `40` | max in-flight sessions |
| `THINK_MS` | `30` | max think-time between requests (set `500` for a realistic-cadence demo with few sessions) |
| `VERBOSE` | unset | `1` logs every request instead of just progress |

The synthetic actors log in with username `load-<n>@example.com` and a shared
load-test password (the server accepts any username with that password — a
demo-only escape hatch so we don't pre-seed a thousand accounts).

Then open the recording:

```bash
proxymock web
```

Switch to the **Sessions** tab. With the default run you'll see ~1000 actor rows
(the named `alice@example.com`, `ops-admin`, `sk_live_billing_7f3a91`, … plus the
`load-*` synthetic users and the unattributed bucket), each with request counts,
latency percentiles, error rate, and a session-level SLO — sortable, with
drill-in to each session's requests in journey order.

## How it maps to the Sessions view

- **Top actors / heavy hitters** — the `shopper` journeys make the most requests.
- **Session SLO vs request success** — the `forbidden`, `browser`, and `admin`
  journeys inject 4xx/5xx so the two rates diverge.
- **Unattributed bucket** — the anonymous `/health` calls.
- **Multiple auth schemes** — confirms session extraction across JWT, Basic, and
  opaque API keys in a single recording.
