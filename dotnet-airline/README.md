# .NET airline booking demo

A small .NET 8 booking API that shops flights, builds a cart, prices it with a partner fare service, authorizes payment with a partner gateway and issues a record locator. It keeps the offer cache, carts and orders in Redis. The scripts in `demo/` record its real traffic with proxymock, then run it with every dependency switched off: the partners and Redis are served from the recording, and the recorded customer journeys are replayed and scored.

The repo includes a committed recording in `proxymock/recording`, so the mock and replay steps work without Redis or the partner simulator. Only `record.sh` needs them.

## What runs where

| Process | Port | Role |
| --- | --- | --- |
| Booking API (`src/BookingApi`) | 8090 | System under test |
| Partner simulator (`src/PartnerSim`) | 5051 schedule, 5052 pricing, 5053 payments | Stand-in for partner systems, 120 to 400 ms per call |
| Redis | 6390 | Offer cache, carts, orders, ID sequences |
| proxymock | 4143 inbound, 15051-15053 and 16390 mapped | Records or mocks everything above |

The API always calls its dependencies on the mapped ports (`SCHEDULE_URL`, `PRICING_URL`, `PAYMENTS_URL`, `REDIS_ADDR`). Under `proxymock record` those ports forward to the real services. Under `proxymock mock` proxymock answers them from the recording and fails closed on anything it has not seen.

## Prerequisites

- .NET 8 SDK
- proxymock, initialized (`proxymock init`)
- For `record.sh` only: `redis-server` and `redis-cli`
- `curl`, `python3`, `lsof` for the scripts (macOS, Linux or WSL2)

Set `PROXYMOCK` to pin a binary or add `--config`/`--context`, for example `PROXYMOCK="proxymock --context dev"`.

## Scripts

`make help` lists the same steps as Makefile targets (`make replay`, `make regression`, `make chaos MODE=slow`).


| Script | What it shows |
| --- | --- |
| `demo/record.sh [dir]` | Starts Redis and the partners, wraps the API with `proxymock record`, drives four bookings (one declined), two error cases and a repeated checkout through port 4143. Prints the RRPair count per host. |
| `demo/mock-and-replay.sh [dir]` | Checks that partners and Redis are down, starts the API under `proxymock mock --no-passthrough`, replays the inbound journeys with the `regression` test config, prints the native score. Exit 1 on any regression. |
| `demo/explain.sh [replay-dir]` | Lists each response that changed, field by field, and each outbound call production never made. |
| `demo/chaos.sh outage\|slow\|garbage` | Same replay with the mocked payment gateway returning 503, taking 6 s, or returning corrupt JSON. |
| `demo/load.sh` | 10 virtual users for 30 s against the mocked API (`VUS`, `FOR` override). |
| `demo/regression.patch` | A one-line pricing change for the regression exercise: `patch -p1 < demo/regression.patch`, run `mock-and-replay.sh`, then `patch -p1 -R < demo/regression.patch`. |
| `demo/drive.sh [base-url]` | The journeys used for recording. |

Results land in `proxymock/results/` (ignored by git). Exports generated from the recording are in `exports/` (`BookingJourneys.java` for Gatling, `booking-journeys.js` for k6).

## Things the demo is built to show

- IDs come from Redis `INCR`, so a replay against mocked Redis gets the same cart IDs and record locators as the recording, with no transforms.
- Totals are computed on read from stored partner quotes. A pricing change therefore shows up as a changed `total` on the cart responses and as a changed `amount` on the outbound payment call, which the mock rejects.
- The StackExchange.Redis client is configured with a reduced command map (no `CONFIG`, `CLUSTER`, pub/sub, `CLIENT`) so recorded Redis traffic is the app's own commands plus the startup `INFO` and `PING`.
- Payment failures map to distinct responses: 402 declined, 503 unavailable or timed out, 502 unreadable or rejected. Checkout claims the cart with `HSETNX` first, so a repeated or concurrent checkout gets 409 instead of a second authorization.
