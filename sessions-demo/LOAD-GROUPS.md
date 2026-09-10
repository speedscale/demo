# Test independent endpoint and session load groups

This is an internal testing breakpoint for S-13073, not the full customer release.
It exercises the shared generator through the real proxymock CLI, with the real
banking app and a proxymock dependency mock. Node 20.3+ is required; no Docker or
package installation is needed. The candidate CLI needs your usual proxymock
configuration.

## Run the milestone

Build the Speedscale `s-13080-scheduled-arrivals` branch, which includes the earlier
selection and artifact-preservation changes:

```sh
# In the Speedscale repository:
go build -o /tmp/proxymock-load-plans ./speedctl/cmd/proxymock
```

Then, from this demo repository's `sessions-demo` directory:

```sh
make test
PROXYMOCK_BIN=/tmp/proxymock-load-plans make bank-load-groups
```

Expect `"success":true` and an artifact directory after roughly 90 seconds on a
warm local build. A failed check exits nonzero and retains logs and evidence.
The harness stops its app, recorder and mock on completion. It records the real
statement dependency, stops it, then starts proxymock with `--no-passthrough`.
Both the input journeys and replay traffic use real HTTP requests.

The acceptance cases are:

| Case | Independent app evidence |
| --- | --- |
| Endpoint groups | Statements run at two concurrent copies while posting runs at one; journal counts equal generator counts. |
| Shared work pool | Statement load ramps from zero to two copies while posting stays at one; the app records queued posting. |
| Isolated work pool | The same plan causes no posting queue when statements have their own pool. |
| Rotating sessions | Eight readers and four writers are visited with concurrency two and one respectively. |
| Sticky sessions | Only two readers and one writer repeat; population remains eight and four. |
| Once-only sessions | Exactly 12 sessions start and complete, without overlapping the same source actor. |
| Independent request arrivals | Statements schedule 30 requests/second and posting schedules 5/second for two seconds, with identical totals under fast and slow responses; slow statements queue posting. |
| Arrival offsets, pauses and ramps | Eight statement starts follow an offset, a constant stage, a zero stage and a linear ramp. |
| Session arrivals | Readers start at 8 journeys/second and writers at 4/second; all 12 actors rotate. Once-only caps starts at eight readers and four writers. |
| Undeliverable arrivals | A concurrency limit or occupied identity pool produces missed starts and a nonzero exit, with successful delivered requests verified separately. |
| Invalid plans | Missing data, unsupported TPS, conflicting flags and total concurrency over capacity fail before workload traffic. |
| Missing dependency | A writer's statement has no recorded dependency response; the app returns 502 and proxymock replay exits nonzero with failed counts. |

The original fixture driver creates inputs only. `proxymock replay --load-plan`
drives every acceptance case. Login responses supply fresh JWTs and execution
IDs through existing `http_res_body`, `json_path`, `var_store` and header
transforms. Each execution gets its own variable cache. The harness does not
replace authentication, account ownership, transaction idempotency or the work
pool. Existing JWT detection identifies actors; it does not synthesize new users.

## Inspect or change a plan yourself

To keep the bank and mock running after validation:

```sh
BANK_KEEP_RUNNING=1 PROXYMOCK_BIN=/tmp/proxymock-load-plans make bank-load-groups
```

The command prints the live bank `base` URL and writes `manual.json` in the
artifact directory. In another terminal, set these two values from that output:

```sh
ARTIFACTS=/path/printed/by/the/harness
BANK_BASE=http://127.0.0.1:PORT
```

Edit a copy of `sessions-rotate-plan.json`, `endpoint-groups-plan.json`, or
`shared-pressure-plan.json`. Arrival examples are `arrivals-fast-plan.json`,
`arrivals-ramp-plan.json` and `session-arrivals-plan.json`. Reset the app, then
replay to a new output directory:

```sh
curl --fail -sS "$BANK_BASE/bank/testing/reset" \
  -H 'X-Bank-Control: harness-control' -H 'Content-Type: application/json' \
  -d '{"statementWorkMs":75,"postingWorkMs":1}'

/tmp/proxymock-load-plans replay \
  --in "$ARTIFACTS/inbound-sessions" \
  --load-plan "$ARTIFACTS/sessions-rotate-plan.json" \
  --test-against "$BANK_BASE" --load-test \
  --out "$ARTIFACTS/my-session-run"

curl --fail -sS "$BANK_BASE/bank/testing/journal" \
  -H 'X-Bank-Control: harness-control' > "$ARTIFACTS/my-session-journal.json"
```

For independent endpoint plans use `inbound-requests`; its prepared credentials
are valid for one hour after capture. For sessions use `inbound-sessions`, which
contains the login/response correlation metadata. Do not remove its `.metadata`
directory. Press Ctrl+C in the harness terminal when done; this stops the bank
and mock. The harness writes its successful `result.json` before exiting;
`make` may return an interrupted status after Ctrl+C. The manual hold is
excluded from meaningful cycle-time comparisons.

## Plan semantics in this breakpoint

`--load-plan` reads a strict JSON **GeneratorConfig** containing `loadGroups`.
It cannot be combined with `--vus`, `--sessions`, `--stage`, `--for`, or `--times`.
An output directory is required. `--load-test` is compatible: it omits detailed
match reporting while preserving HTTP failure and group-delivery accounting.

Each group has a stable `id`, an existing filter expression in `scope`, a
`selection` (`LOAD_SELECTION_REQUESTS` or `LOAD_SELECTION_SESSIONS`), and stages.
Session selection includes all available requests for actors whose traffic
matches its filter. Session groups claim whole actors first; request groups
claim remaining requests. The first matching group of each kind owns overlaps.
`loadUnmatchedPolicy` must explicitly exclude unmatched traffic or reject it.

Stages use `virtualUsers.virtualUsers` for request-copy concurrency or
`sessions.sessions` for session concurrency. `duration`, `rampFor` and
`startAfter` use protobuf duration strings such as `"2s"`. A ramp is part of its
stage duration and interpolates from the previous stage's target. Zero targets
stop new executions. A request copy repeats the group's selected request
sequence; it is not an arrival-rate target or a requests-per-second guarantee.
Request delay defaults to recorded timing; `requestDelay.mode: "NONE"` removes it.

A session population defaults to all eligible actors, independently of
concurrency. Set `population.size` for a seeded subset and `population.reuse`
to `LOAD_SESSION_REUSE_ROTATE`, `LOAD_SESSION_REUSE_STICKY`, or
`LOAD_SESSION_REUSE_ONCE`. Session-concurrency targets cannot exceed the selected population.
Once-only fails if the schedule ends before every selected actor starts.
`loadSeed` controls initial source assignment, not network completion timing.

Scale-down lets current executions finish; traffic can continue through a zero
window while those executions drain. No new execution starts in that window.
The final `loadDrainTimeout` defaults to 30 seconds. Expiry cancels outstanding
HTTP requests and fails. HTTP errors, execution failures, unavailable generator
capacity and positive load with no eligible input also fail by default.

### Scheduled arrivals

Use `arrivals` stages to schedule starts independently of response completion.
For example, within a request group:

```json
{
  "arrivalPolicy": {"maxConcurrency": 20, "maxStartLag": "0.1s"},
  "stages": [
    {"duration": "2s", "arrivals": {"rate": 30}},
    {"duration": "1s", "arrivals": {"rate": 0}},
    {"duration": "2s", "rampFor": "1s", "arrivals": {"rate": 10}}
  ]
}
```

This fragment belongs inside an existing group; retain its ID, scope and selection.
The example schedules 75 starts: 60, zero, then 15 during the ramp and hold.
`rate` accepts fractions and defaults to starts per second. Set `timeUnit: "60s"`
with `rate: 1` for one start per minute. The total is the floor of the integrated
rate across all stages. Starts occur at half-unit crossings of that integrated
schedule; a constant 1/minute stage lasting one minute starts at 30 seconds.
A positive schedule too short to contain one whole start fails validation.

For request selection, each start sends one recorded request, cycling through the
selected requests in recording order. For session selection, each start runs a
complete journey with its own response-variable state and the group's population
reuse policy. Session `requestDelay` remains available inside `arrivals`;
individual request arrivals do not accept it. Once-only caps scheduled starts at
population size and rejects a schedule too small to visit that population.

Both admission bounds are required. `maxConcurrency` bounds active requests or
journeys; session starts also need an available actor. Arrivals may use a limit
larger than their population, but an occupied population can still cause misses.
`maxStartLag` bounds the tolerated delay from a scheduled deadline to executor
start, before request transformation and network transmission. It is not an
application latency goal. Missing capacity, identity availability or this deadline
drops that start and fails the run; subsequent deadlines remain fixed. No new
starts are admitted in zero windows or after the group's end. Active journeys
may finish during those periods.

Arrival and concurrency groups share the same generator capacity and lifecycle.
Each group must use one strategy throughout its stages. This breakpoint uses
deterministic spacing; seeded randomized spacing is still planned.

## Saved evidence and remaining release work

Each replay directory contains `load-groups.json`: resolved seed, population,
per-source start counts, started/completed/failed executions, requests, failed
requests and peak concurrency. The sibling `*-journal.json` files are independent
application observations. Failed replay results are retained too. Input plans,
recordings, correlation metadata, logs and provenance remain in the same bundle.
Initial validation errors appear in the CLI log before a run summary exists.

Arrival reports also include `arrivalUnit`, `scheduled`, `missed`,
`missedCapacity`, `missedIdentity`, `missedLate`, `missedCancelled` and
`maxStartLagMs`. Zero-valued arrival fields may be omitted. `scheduled` equals
`started + missed`; missed reasons sum to `missed`. Application failures belong
to delivered executions and request failure counts, not missed-start counts.

The harness currently measures elapsed local validation time; it does not yet
compare an equivalent end-to-end baseline or claim the 50% cycle-time goal.
Grouped adaptive TPS, randomized arrivals, shares/weights/budgets, identity cloning,
scoped latency/delivery goals, UI editing, distributed Kubernetes validation,
Kraken and final customer documentation/blog remain in the full release plan.
Grouped non-HTTP protocols and TPS are rejected in this breakpoint.
