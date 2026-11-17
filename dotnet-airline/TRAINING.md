# Record, mock and replay a .NET booking API

This workshop uses a small airline booking API to inspect recorded requests, replay a booking flow with mocked dependencies, and catch a pricing bug. The API calls partner schedule, pricing and payment services and stores its carts and orders in Redis. All code and traffic in this example are synthetic.

Allow 45 minutes after setup for the core exercises. Fresh recording and Gatling/k6 exports are optional extensions. Keep this workbook open in your browser and run the commands in a terminal; each exercise includes a result to check and a question to answer.

## Setup

The commands below were rehearsed on macOS with released proxymock **v2.5.1386**. The helpers require Bash; Linux and WSL2 have not been rehearsed for this workbook. Native Windows details are in [Windows setup](#windows-setup).

| Requirement | Check |
| --- | --- |
| Git | `git --version` |
| .NET 8 SDK | `dotnet --list-sdks` includes an `8.0` SDK. Install the [SDK](https://dotnet.microsoft.com/en-us/download/dotnet/8.0), rather than just the runtime. |
| proxymock | Follow the [installation guide](https://docs.speedscale.com/proxymock/getting-started/installation/), including activation, then run `proxymock version --client`. The expected results below use v2.5.1386. |
| Shell tools | Bash, Make, `curl`, `python3`, `lsof` and `patch`. |
| Redis | Only needed for the optional fresh-recording exercise: `redis-server` and `redis-cli`. |

Start a Bash session (`bash`), then clone the example and stay in its application directory for every exercise:

```bash
git clone https://github.com/speedscale/demo.git
cd demo/dotnet-airline
export PROXYMOCK=proxymock
$PROXYMOCK version --client
make help
```

`PROXYMOCK` is the executable used by the helpers and the commands in this workbook. To use an existing configuration, set it to `proxymock --config /absolute/path/config.yaml --context my-context`, using your own path and context. The helpers split this string on whitespace, so use an executable/config path without spaces. Keep API keys in the configuration file, rather than in this variable.

Use an approved development configuration. No Kubernetes cluster or customer capture is needed. The committed recording supplies all dependency responses for the core exercises, including Redis responses; a Redis server does not need to be installed or running.

Reserve ports 8090, 4140, 4143, 15051-15053 and 16390 for the API and proxymock, plus 7788 for the viewer. The optional recording step also uses 5051-5053 and 6390. The scripts refuse occupied ports. Stop only processes you own before starting.

## 1. Inspect a booking (5 minutes)

Search the committed recording:

```bash
$PROXYMOCK search --in proxymock/recording --direction in --method POST --limit 5 --output pretty
$PROXYMOCK search --in proxymock/recording --direction out --query /payments/ --limit 5 --output pretty
$PROXYMOCK web --in proxymock/recording --chat=false --forwarder-addr= --host 127.0.0.1 --port 7788 --open=false
```

Open the printed local URL. Find `POST /api/carts/C000002/checkout`, inspect its request and response, then find the outbound `POST /payments/v1/authorize` call. Open one RRPair file from `proxymock/recording` in your editor too. The viewer uses local files with chat and automatic Forwarder access disabled.

**Check:** the committed recording contains 27 inbound requests and 73 outbound calls: 11 partner HTTP calls and 62 Redis commands. Inbound traffic is the replay input; outbound traffic supplies the dependency mocks. The recording includes a declined card and invalid requests, so a recorded non-2xx response can be an expected result.

**Answer:** what amount did the API send to the payment gateway, and which fields connect that call to the cart? Stop the viewer with Ctrl-C before continuing.

## 2. Replay with the dependencies switched off (10 minutes)

```bash
make replay
```

The helper verifies that the real partners and Redis are down, builds the API, starts it under `proxymock mock --no-passthrough`, and replays the recorded inbound requests using the `regression` test config. It stops the processes it started when the run ends.

The API calls its dependencies on mapped ports, such as 15053 for payments and 16390 for Redis. During recording, `--map 15053=http://localhost:5053` forwards to the real partner. During mocking, the same port serves recorded responses. This also captures clients that do not honor HTTP proxy settings.

**Check:** the native score reports 27/27 responses matched, 73/73 dependency calls mocked, zero no-match, zero passthrough, and passing goals. Results go into new `proxymock/results/replay-*` and `mock-*` directories on each run. Use the paths printed by the command to inspect `replay-verdict.json` and the mock RRPairs.

Accuracy measures responses compared with the recording. Mock match rate measures dependency calls answered from recorded data. A completed HTTP request alone does not prove that its body matched. `--no-passthrough` rejects unexpected calls routed through the mock; the port mappings make this API's configured dependencies use it.

**Answer:** why did the declined payment pass the regression check? Why are both response accuracy and mock match rate needed?

Cart IDs and record locators stay stable here because Redis `INCR` is mocked. Real services may need transforms for tokens, timestamps and generated IDs before they have a clean baseline.

## 3. Catch a pricing regression (10 minutes)

Open [`src/BookingApi/Pricing.cs`](src/BookingApi/Pricing.cs). The booking fee is $4.50 per passenger. The supplied patch changes it to one fee per booking.

```bash
make regression
```

This target applies the patch, runs the replay, explains the differences, and restores `Pricing.cs`. A nonzero Make exit is expected because the replay detects the bug.

**Check:** 21/27 responses match. The two multi-passenger carts have changed totals; one changes from `383.56` to `379.06`. Their checkout payment requests carry the changed amounts and produce mock misses. The single-passenger bookings still match. Inspect `bodyChanges` in the verdict and the outbound misses printed by the helper.

**Answer:** why would a single-passenger smoke test miss this bug? Which evidence shows the changed total also affected the payment request?

Confirm the patch was restored and replay the healthy code again:

```bash
git diff -- src/BookingApi/Pricing.cs
make replay
```

**Check:** the diff is empty and the score returns to 27/27 responses and 73/73 mocked dependency calls. Preserve any edits you made before the workshop; the target only reverses its own patch.

## 4. Exercise payment failures (10 minutes)

Run each scenario separately and inspect it before moving to the next:

```bash
demo/chaos.sh outage
demo/explain.sh
```

```bash
demo/chaos.sh slow
demo/explain.sh
```

```bash
demo/chaos.sh garbage
demo/explain.sh
```

| Scenario | Dependency behavior | Expected API checkout response |
| --- | --- | --- |
| `outage` | Payment gateway returns 503 | 503 with `retryable: true` |
| `slow` | Payment call takes 6 seconds; the API timeout is 5 seconds | 503 with `retryable: true` |
| `garbage` | Payment gateway returns corrupt JSON | 502 |

**Check:** each chaos helper exits nonzero because checkout responses differ from the healthy recording. The other 23/27 responses still match. Error paths can also change the downstream call sequence; inspect mock misses alongside the response diff. For example, the outage uses the mock's `--chaos '(location REGEX "^/payments/"): status=503'` option; it changes payment calls without changing the recorded files.

**Answer:** which failures should the client retry? Inspect the actual response bodies before deciding. For a negative-scenario test, define the expected error response for that scenario; a mismatch against the healthy recording is the demonstration here.

## 5. Run a short load exercise (5 minutes)

```bash
VUS=5 FOR=10s make load
```

Read requests per second, latency percentiles and failed-request counts from the output. The app still runs against mocked dependencies. These figures describe this API on your machine with those mocks; they do not establish production capacity or the partners' latency.

**Check:** the run completes for the requested duration and prints metrics. The helper uses `--exit-zero`, so its shell exit status is not a pass/fail load gate. Inspect the reported failures and define explicit goals before using a load run in CI.

**Answer:** which parts of a real booking system are absent from this measurement?

## Optional: record fresh traffic (10 minutes)

Install Redis locally, keep its normal server stopped if it uses a conflicting demo port, then run:

```bash
demo/record.sh proxymock/recording-workshop
```

The helper starts its own Redis on 6390 and the partner simulator on 5051-5053, records the API, drives the booking journeys, and stops the processes it started. Choose a fresh output name if `recording-workshop` already exists. It leaves the committed recording untouched.

**Check:** the captured hosts include inbound `localhost`, all three partner ports, and Redis on 6390. The reference capture has 27 inbound requests, including the startup health request, and 73 outbound calls. Inspect both directions before replaying your new recording:

```bash
$PROXYMOCK search --in proxymock/recording-workshop --direction out --limit 5 --output pretty
demo/mock-and-replay.sh proxymock/recording-workshop
```

**Answer:** what would be missing if you captured only inbound requests?

## Optional: inspect Gatling and k6 exports

```bash
demo/export.sh
```

Open [`exports/BookingJourneys.java`](exports/BookingJourneys.java) and [`exports/booking-journeys.js`](exports/booking-journeys.js). The export starts with the recorded requests; this demo's Python helper then adds correlation so each run uses the cart IDs and record locators returned by the API. Review the checks and correlation before using these with another service. The workbook does not compile or execute Gatling or k6.

## Apply the workflow to your service

Start in your service's repository with an approved development configuration. Record one complete flow, including its outbound HTTP and database calls. If traffic already exists in an approved capture, follow the [BYOC import guide](https://docs.speedscale.com/byoc/use-traffic/) instead.

Start the service under mocks using the dependency mappings from its recording, then replay the inbound traffic and read the native score. Resolve mock misses and expected differences such as generated IDs before treating the result as a regression gate. Agree the assertions with the service owner and keep the accepted recording and test configuration with the code.

## Windows setup

The `demo/*.sh` helpers require Bash. For this workbook on Windows, use WSL2 and install the Linux .NET 8 SDK, proxymock and shell tools inside WSL. Work in its Linux filesystem and run the Bash commands there. WSL2 has not been rehearsed for this workbook.

Native PowerShell execution has not been validated. The v2.5.1386 native Windows executable is unsigned, which can block launch on managed desktops. Follow your organization's installation policy; do not treat native Windows as a verified workshop path.

## Troubleshooting and cleanup

| Symptom | Action |
| --- | --- |
| `dotnet` is missing or the SDK is incompatible | Install the .NET 8 SDK and check `dotnet --list-sdks` in the same shell. |
| A command or flag is missing | Compare `version --client` with the rehearsed release and inspect that command's `--help`. |
| A demo port is occupied | Inspect it with `lsof -nP -iTCP:<port> -sTCP:LISTEN`. Stop only your own processes. |
| `partner/Redis ports still listening` | Stop the service you started on 5051-5053 or 6390. The mock exercise requires the real backends to be down. |
| Healthy replay does not match | Check `git diff`, the selected recording and the verdict. Use a fresh results directory; the supplied helpers do this automatically. |
| Need the latest field-level diff | Run `demo/explain.sh` immediately after a replay or chaos exercise. |

Stop any viewer you started with Ctrl-C. The helpers stop their own API, mock and backend processes. Keep the result files while reviewing the exercise; `make clean` removes generated results, helper state and .NET build output when you are finished.
