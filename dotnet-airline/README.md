# .NET airline booking demo

A small .NET 8 booking API that shops flights, builds a cart, prices it with a partner fare service, authorizes payment with a partner gateway and issues a record locator. It keeps the offer cache, carts and orders in Redis. The scripts in `demo/` record its real traffic with proxymock, then run it with every dependency switched off: the partners and Redis are served from the recording, and the recorded customer journeys are replayed and scored.

The repo includes a committed recording in `proxymock/recording`, so the mock and replay steps work without Redis or the partner simulator. Only `record.sh` needs them.

## Hands-on workshop

Follow the [45-minute training workbook](TRAINING.md) to inspect a booking, replay with mocked dependencies, catch a pricing regression, exercise payment failures and run a short load test. Fresh recording and Gatling/k6 exports are optional extensions. The workbook includes setup, expected results, learner questions and Windows validation limits.

## What runs where

| Process | Port | Role |
| --- | --- | --- |
| Booking API (`src/BookingApi`) | 8090 | System under test |
| Partner simulator (`src/PartnerSim`) | 5051 schedule, 5052 pricing, 5053 payments | Stand-in for partner systems, 120 to 400 ms per call |
| Redis | 6390 | Offer cache, carts, orders, ID sequences |
| proxymock | 4143 inbound, 15051-15053 and 16390 mapped | Records or mocks everything above |

The local scripts point the API at mapped dependency ports (`SCHEDULE_URL`, `PRICING_URL`, `PAYMENTS_URL`, `REDIS_ADDR`). Under `proxymock record` those ports forward to the real services. Under `proxymock mock` proxymock answers them from the recording and fails closed on anything it has not seen.

## Prerequisites

- .NET 8 SDK
- proxymock, initialized (`proxymock init`)
- For `record.sh` only: `redis-server` and `redis-cli`
- `curl`, `python3`, `lsof` for the scripts (macOS, Linux or WSL2)

Set `PROXYMOCK` to pin a binary or add `--config`/`--context`, for example `PROXYMOCK="proxymock --context dev"`.

## Run on minikube

Build local images and deploy the API, partner simulator and Redis into the dedicated `airline-demo` namespace:

```bash
demo/minikube.sh build
demo/minikube.sh deploy
demo/minikube.sh traffic
demo/minikube.sh status
```

The default profile and kube context are `minikube`; override `PROFILE` or `KUBE_CONTEXT` explicitly for another local profile. The helper builds both images inside minikube and uses `imagePullPolicy: Never`, so no registry push is needed. Deploying restarts the API and partners to pick up rebuilt local images. Redis uses temporary storage and keeps data until its Pod is replaced.

The container images set `LISTEN_HOST=0.0.0.0`; local execution still defaults to `127.0.0.1`. In the cluster the API calls `airline-partners` on ports 5051-5053 and `airline-redis` on 6379. The traffic helper runs a temporary unprivileged Python Pod, checks the expected response statuses for 26 requests, then removes it. Requests go through the Service so capture includes inbound traffic; a port-forward reaches the application over loopback and can bypass inbound interception. Set `TRAVEL_DATE=2027-01-18` when you want a different offer-cache key for a fresh capture. To interact with the API yourself:

```bash
kubectl --context minikube -n airline-demo port-forward svc/airline-booking-api 18090:8090
```

To keep generating traffic while you work, enable the CronJob:

```bash
demo/minikube.sh traffic-on
```

It runs the same 26-request flow every two minutes through the Service. Runs cannot overlap, failed runs are not retried, and each run has a 90-second limit. The last successful Job and two failed Jobs are retained. The driver is mounted from a ConfigMap, so rerun `traffic-on` after changing `demo/drive-cluster.py`. Repeated offers use the five-minute Redis cache; schedule calls return after the cache expires.

Pause future runs with `demo/minikube.sh traffic-off`; an active run can finish. Enable them again with `traffic-on`. The CronJob keeps running while minikube is up until you pause it.

This deployment does not install or retarget Speedscale. Choose an approved eBPF-enabled Speedscale installation and configuration before enabling capture. Leave the workload managed by the operator so it can prepare and restore mocked replays. Do not set `operator.speedscale.com/ignore=true`: it also prevents replay interception. Enable eBPF capture for `airline-booking-api` in namespace `airline-demo` using the [eBPF capture documentation](https://docs.speedscale.com/reference/ebpf-traffic-collection/), then run `demo/minikube.sh traffic` again. Verify the intended Cloud tenant and destination before inspecting the capture.

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
| `demo/export.sh [dir]` | Regenerates the Gatling and k6 exports from a recording and rewires them to use the cart IDs and record locators each run creates. |

Results land in `proxymock/results/` (ignored by git). Exports generated from the recording are in `exports/` (`BookingJourneys.java` for Gatling, `booking-journeys.js` for k6). They capture each new cart ID and record locator from the API's responses, so they can run repeatedly and with several virtual users against a real Redis.

## Things the demo is built to show

- IDs come from Redis `INCR`, so a replay against mocked Redis gets the same cart IDs and record locators as the recording, with no transforms.
- Totals are computed on read from stored partner quotes. A pricing change therefore shows up as a changed `total` on the cart responses and as a changed `amount` on the outbound payment call, which the mock rejects.
- The StackExchange.Redis client is configured with a reduced command map (no `CONFIG`, `CLUSTER`, pub/sub, `CLIENT`) so recorded Redis traffic is the app's own commands plus the startup `INFO` and `PING`.
- Payment failures map to distinct responses: 402 declined, 503 unavailable or timed out, 502 unreadable or rejected. Checkout claims the cart with `HSETNX` first, so a repeated or concurrent checkout gets 409 instead of a second authorization.
