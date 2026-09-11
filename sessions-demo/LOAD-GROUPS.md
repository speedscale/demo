# Test independent endpoint and session load groups

This is an internal testing breakpoint for S-13073, not the full customer release.
It exercises the shared generator through the real proxymock CLI, with the real
banking app and a proxymock dependency mock. Node 20.3+ is required; no Docker or
package installation is needed. The candidate CLI needs your usual proxymock
configuration.

## Run the milestone

Build the Speedscale `s-13079-session-field-synthesis` branch, which includes the earlier
selection and artifact-preservation changes:

```sh
# In the Speedscale repository:
go build -o /tmp/proxymock-load-plans ./speedctl/cmd/proxymock
```

Then, from this demo repository's `sessions-demo` directory:

```sh
PROXYMOCK_BIN=/tmp/proxymock-load-plans make bank-load-groups
```

Expect `"success":true` and an artifact directory after roughly two to three minutes on a
warm local build. A failed check exits nonzero and retains logs and evidence.
The harness stops its app, recorder and mock on completion. It records the real
statement dependency, stops it, then starts proxymock with `--no-passthrough`.
Both the input journeys and replay traffic use real HTTP requests.

For the focused shares, budgets and weighted-session loop:

```sh
PROXYMOCK_BIN=/tmp/proxymock-load-plans make bank-load-composition
```

This reuses the same real capture, dependency mock and bank journal, but runs
only composition cases. `load-group-profile.json` identifies the selected focused profile or
`all`; `bank-load-groups` still runs the full matrix. Both support the manual hold.

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
| Seeded jitter | Same-seed fast/slow runs retain identical planned offsets and counts; a changed seed changes offsets. Jittered journeys still rotate all actors, and jittered overload fails. |
| Undeliverable arrivals | A concurrency limit or occupied identity pool produces missed starts and a nonzero exit, with successful delivered requests verified separately. |
| Shared request rate | A 25 requests/second pool splits 80/20: 40 statement starts and 10 posting starts over two seconds. |
| Finite budgets | Shared groups stop at three statements and four posts without redistribution; a standalone three-request budget finishes before its 30-second maximum window. |
| Weighted session starts | A 20 journeys/second pool splits 80/20: 32 reader journeys and eight writer journeys, visiting all 12 source actors. |
| Shared-rate shortfall | Saturated statements miss their own starts; posting retains exactly its four allocated starts. |
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
`arrivals-ramp-plan.json`, `session-arrivals-plan.json`, `jitter-fast-plan.json`
and `jitter-sessions-plan.json`. Composition examples include
`composition-requests-plan.json`, `composition-budget-plan.json` and
`composition-sessions-plan.json`. Reset the app, then
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
`loadSeed` controls initial source assignment and jittered planned deadlines.
It does not control network completion timing or response-dependent actor availability.

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
rate across all stages. With default even spacing, starts occur at half-unit crossings of that integrated
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
Each group must use one strategy throughout its stages.

### Repeatable randomized spacing

Set `arrivalPolicy.spacing` to `"LOAD_ARRIVAL_SPACING_JITTERED"` and save an explicit
`loadSeed` on the top-level plan. The generator chooses one random position within
each unit of integrated offered work. At a constant 10 starts/second, that means
one start within each 100ms interval, with varying gaps between starts. Ramps use
the same rule against their changing rate. Total scheduled volume is unchanged.
This is bounded jitter; it does not model Poisson arrivals with variable counts.

Omitting `spacing`, or setting `"LOAD_ARRIVAL_SPACING_EVEN"`, retains even timing.
An explicitly unknown spacing is rejected. The same seed, stable group ID and
schedule reproduce planned deadlines; changing the seed or group ID changes the
jitter. Adding/reordering unrelated groups does not consume or shift this group's
random sequence. When no `loadSeed` is supplied, the resolved seed is saved in
`load-groups.json`; use that value to reproduce the schedule explicitly.

Close randomized deadlines can hit concurrency or identity limits even when an
evenly spaced plan passes. Such starts are counted as missed and fail; the scheduler
does not smooth them or change later deadlines. Real dispatch/network timing and
response-dependent actor availability are not made deterministic by the seed.

### Shared rates and weighted session populations

Add an entry to the top-level `loadArrivalPools` array to define one parent
arrival timeline. For example:

```json
{
  "id": "bank-mix",
  "selection": "LOAD_SELECTION_REQUESTS",
  "stages": [{"duration": "2s", "arrivals": {"rate": 25}}]
}
```

Each member group retains its scope and `arrivalPolicy` admission bounds, and
sets `arrivalShare`, for example
`{"poolId":"bank-mix","basisPoints":8000}`. Use 2000 for the other group.
Active members must total exactly 10000 basis points (100%). Remove each member's
local `stages`, `startAfter` and `arrivalPolicy.spacing`; these are inherited from
the pool. A disabled member does not cause automatic rescaling of other shares.

The parent offers 50 starts; members receive 40 and 10. A bounded repeating
allocation cycle spreads each member's share across the parent timeline. Stable
group IDs break equal-position ties. Short runs use the cycle's prefix, so an
80/20 split of three starts is two and one. No parent starts are lost through
independent rounding. A positive share receiving zero starts is rejected; extend
the parent window. Pool `startAfter`, ramps, zero stages and optional `spacing`
work like independent arrival timelines. For jitter, the seed and pool ID control
the parent timing; allocation selects each member's deadlines from that timeline.

For weighted reader/writer journeys, use a pool with
`selection: "LOAD_SELECTION_SESSIONS"` and separate session groups for each persona.
Members must use the pool's unit. At 20 journeys/second for two seconds, 8000/2000
produces 32 reader starts and eight writer starts. Each persona's population still
rotates or sticks according to its own reuse policy. Longer journeys produce more
requests and hold identities longer; an 80/20 start mix promises neither an 80/20
request mix nor an 80/20 active-user split. Set session think time through
`arrivalShare.requestDelay` rather than parent arrival stages.

An unavailable identity or saturated member misses its assigned start and fails.
Other members never absorb that work. Standalone request/session groups may
coexist with pools under the same run clock and global capacity limit.

### Finite primary-start budgets

Set a positive `startBudget`, such as `"3"`, on an arrival group to consume only
its first three planned starts. For request selection that is three individual
primary requests, including failed attempts; for sessions it is three complete
journey starts. Retries/redirects are not additional primary starts. Budgets do
not promise successful completions, and never truncate an active journey.

The schedule must offer at least the budget within its stages; an impossible
budget fails setup. The stage timeline bounds admission, and the configured drain
time bounds remaining work after that timeline. Completed budgeted groups can
finish early after their in-flight work completes. Missed budgeted starts fail
without replacement. Budget caps never transfer unused allocations to siblings.

Budgets require arrival scheduling. Once-only populations cannot also use shares
or budgets in this breakpoint: population exhaustion conflicts with the prescribed
mix/count. Use independent once-only groups when every selected actor must run
exactly once. Generic per-source weights and cloned identities remain later work.

## Recorded arrival multiples

Run `PROXYMOCK_BIN=/path/to/candidate/proxymock make bank-load-multiples` for the
focused real capture/mock/replay cases. `bank-load-groups` includes these cases
with all previous assertions. The harness saves the baseline windows in each plan.

For a group, specify an explicit recording window and a multiplier in every
arrival stage:

```json
{
  "recordedBaseline": {
    "start": "2026-09-10T12:00:00Z",
    "end": "2026-09-10T12:01:00Z"
  },
  "stages": [
    {"duration": "30s", "rampFor": "10s", "arrivals": {"recordedMultiple": 2}},
    {"duration": "5s", "arrivals": {"recordedMultiple": 0}}
  ]
}
```

These fields extend a normal scoped arrival group with explicit `selection` and
`arrivalPolicy`. Replace the example timestamps with a window from your recording.
The start is inclusive; the end is exclusive. With 60 selected statement requests
in that minute, the baseline is one request/second; 2× targets two/second. The
10-second ramp starts at zero and reaches that target, followed by 20 seconds at
the target: 50 planned starts, then a five-second pause. This is a rate multiple,
not two concurrent copies of the recording. Exact planned starts still use the
arrival scheduler's floor of integrated offered work.

For `LOAD_SELECTION_SESSIONS`, count each selected session's earliest request
once, even when later requests fall outside the window. The recorded banking
fixture contains 12 statement requests and eight posting requests, but eight
reader journeys and four writer journeys. Across the same baseline-length replay,
2× statements/1× posting yields 24/8 request starts; 2× readers/1× writers yields
16/4 complete journeys. Different journey lengths and deliberate repeated client
requests explain the different counts. Extra HTTP attempts caused by replay-time
redirects/retries are not new primary scheduled starts.

Ownership and the seeded population limit are applied before measurement. Changing
a filter, group order, selected session population or recording can change the
baseline. The full explicit window is the denominator, including quiet intervals.
It measures the rate; it does not filter replay sources or cut up selected
journeys. Session rotation/sticky/once behavior remains the group's population
policy. Application latency never changes the planned rate.

`load-groups.json` includes `recordedBaseline`: window boundaries and duration,
`unit`, measured `starts`, `ratePerSecond`, and each stage's `multiple` and derived
`ratePerSecond`. Ramps, start offsets, seeded jitter, concurrency/identity limits,
start budgets and missed-start failures retain the existing arrival semantics.
An impossible budget is rejected after compiling the recording and before traffic.

Missing or invalid timestamps, an empty baseline, and derived rates beyond the
scheduler's limits fail setup. All stages in this mode require an explicit
`recordedMultiple`; use zero for a pause. Do not also set `rate` or `timeUnit`.
Mixed absolute/multiple stages and recorded multiples inside shared pools are
rejected in this breakpoint. Standalone multiple groups can coexist with absolute
arrival groups and pools. The JSON plan remains unchanged by compilation.

## Scoped latency and sample goals

Run `PROXYMOCK_BIN=/path/to/candidate/proxymock make bank-load-goals` for the
focused pressure/isolation and session-endpoint acceptance cases. The default
`bank-load-groups` includes these with every earlier case.

Add `goals` to a load group. For example, this goal measures transaction-posting
requests whose attempts begin between 750 ms and 2.5 seconds after the run starts:

```json
{
  "id": "posting-during-pressure",
  "scope": {
    "operator": "AND",
    "conditions": [{"operator": "AND", "filters": [
      {"include": true, "operator": "CONTAINS", "optUrl": "/transactions"}
    ]}]
  },
  "startAfter": "0.75s",
  "endAfter": "2.5s",
  "minSamples": "12",
  "rule": {"metricName": "p95Latency", "type": "TOO_HIGH", "action": "ALERT", "value": 100}
}
```

The same goal works inside a complete-session group: its samples are matching
HTTP requests, not journey starts. Goal scopes match the selected source RRPair supplied by the replay iterator,
with request transforms already applied and before replacing its recorded response.
They use the same filter expressions as group scopes. Latencies and errors come
from actual replay.
A filter on recorded status 200 therefore keeps those source requests even when
replay returns 503; failures cannot filter themselves out. Omitted scope includes
all HTTP attempts in the group. Nested rule location/method/metric-label filters
are rejected; use the goal scope.

Windows are half-open and use actual attempt start time on the common run clock.
A request started within a window counts there even if it completes during drain.
Omitted start means zero; omitted end includes the full run and drain. Add separate
named goals for baseline, ramp, pressure, disruption or recovery intervals. A
future or intentionally quiet window with no observations cannot pass a configured
goal. `minSamples` defaults to one and must be positive; use a larger number for
meaningful tail measurements. The limit is 64 goals per group and 256 active goals
per plan.

Supported metric names are `minLatency`, `maxLatency`, `avgLatency`, `p50Latency`,
`p95Latency`, `p99Latency` and `totalTransactionCount`. Latency thresholds are in
milliseconds. Timing matches the existing HTTP client's response-header metric;
it excludes session think time and response-body consumption. Percentiles use the
existing DDSketch convention with 1% relative accuracy; min/max/mean use the actual
sample values. Small samples have coarse percentile ranks. Request-count goals
measure attempted HTTP calls in the scope/window, not successful completions or
session-start counts.

The existing NotificationRule evaluator compares values rounded to two decimals.
`TOO_HIGH` means actual must be <= value; `TOO_LOW` means actual must be >= value.
Use `action: "ALERT"`. Thresholds must be finite, nonnegative and <= 1e12.
Any breached goal fails replay after the work drains. Missing required samples
fails independently of its numeric threshold. Existing HTTP/transport failures
and missed-start failures remain strict; these goals do not relax delivery.

`load-groups.json` now has group-level `response` aggregates and per-goal `response`
aggregates: samples, HTTP/transport failures, min/max/mean/p50/p95/p99 milliseconds,
and a bounded mergeable `distribution`. These survive low-data mode and failures.
Merge distributions to combine runs or workers; never average their percentiles.
Each goal also records its ID, PASS/FAIL status, actual value, minimum sample count,
and the shared report-goal Assertion tagged by group and goal ID. Failure `reason`
is `threshold`, `missing_samples`, or `invalid_telemetry`.

The bank pressure case offers 60 statement requests and 40 posting requests.
Both shared and isolated work pools receive all starts. With the shared pool,
posting breaches its 100 ms p95 goal during pressure; baseline and recovery pass.
With statement isolation, all three goals pass. The independent bank journal
confirms posting queues only under shared contention. A separate session case
verifies 16 posting samples within eight complete writer journeys, and a missing
scope case fails with `missing_samples` despite full arrival delivery.

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

`arrivalSchedule` records `version` (currently `integrated-v1`), the effective
`spacing`, and `firstStartOffsets`: up to sixteen planned offsets from the common
run start. Offsets are duration strings, including the group's start offset.
Once-only samples stop at the capped population. These are planned deadlines,
not HTTP timestamps or a complete event log. Compare the samples in `jitter-fast`
and `jitter-slow` to see that response speed leaves the plan unchanged, then compare
`jitter-changed-seed` to see a different reproducible schedule.

For shared groups, `allocation` includes the pool ID, basis points,
`weighted-cycle-v1`, original `allocated` starts and intentionally `suppressed`
starts due to a budget. Top-level `pools` preserve original parent totals.
`startBudget` records an explicit cap; `scheduled` is the resulting planned count.
Suppressed starts are intentional and differ from missed starts. The same compiled
schedule supplies the compiler preview fields and runtime report samples.

The harness obtains provenance with `proxymock version --client`, bounded to ten
seconds, so local validation does not wait on cloud version discovery. Reported
elapsed time now includes that setup step; older timings excluded it.

The harness currently measures elapsed local validation time; it does not yet
compare an equivalent end-to-end baseline or claim the 50% cycle-time goal.
Grouped adaptive TPS, generic per-source weights, identity cloning,
delivery/error tolerance overrides, distributed goal/report integration, UI editing, distributed Kubernetes validation,
Kraken and final customer documentation/blog remain in the full release plan.
Grouped non-HTTP protocols and TPS are rejected in this breakpoint.


## Verify session identities

Run the focused real-app matrix:

```sh
PROXYMOCK_BIN=/tmp/proxymock-load-plans make bank-load-identity
```

This runs 24 journeys across 12 bank actors, using real login, fresh JWTs and
execution IDs, account ownership and transaction handling. It verifies each
actor repeats twice. Negative cases select the shared `role` claim, an absent
claim and the changing per-login `jti` claim: all 24 journeys still complete,
but the identity objective fails. A separate corrupted-credential case verifies
real authentication failures. Expected failures are required for the suite to
print `success:true`; they do not mean the suite itself failed.

Inside a session group, add `"identityVerification": {"jwtClaim": "sub"}`.
An empty object defaults to `sub`; omitting the object disables the check.
The claim must be a JWT string. Anonymous login is allowed, but each complete
execution must present an unambiguous bearer identity on at least one successful
HTTP response and retain that identity within and across repeats of its source.
Refreshing a JWT is fine when its identity claim stays the same. Missing,
malformed or ambiguous Authorization identity evidence fails the objective.
Cookie-only and Basic-auth applications need a different verification mechanism;
this option does not infer identity from a source label.

Distinct source actors in enabled groups using the same claim share one identity
namespace. Reusing the same identity across those sources fails both owners,
even when their executions do not overlap. Different claim names are separate
namespaces. Identity checks apply to the request associated with the final HTTP
response, including client-added headers and followed redirects; intermediate
redirect hops are not separately verified. Transport failures cannot verify.
This checks presented identity evidence, not JWT signatures or whether an app
actually enforces ownership. The bank's journal and real auth provide those
independent checks in this demo. It neither provisions accounts nor enables
population cloning.

`load-groups.json` adds an `identity` object to enabled groups. `status` is
`PASS` only if at least one execution ran and all executions verified.
`executions`, `verified`, `missingIdentity`, `changedIdentity` and `incomplete`
count executions; `authFailures` and `failedRequests` count HTTP attempts.
Failure categories may overlap. `sources` preserves per-source counts and
collision flags; `collidingSources` counts affected sources. Collisions remove
all affected sources' executions from `verified`. Up to 16 failure examples
identify group, source, execution and reasons. No claim values, tokens or internal
fingerprints are added to this report; existing source IDs remain visible.
An identity failure does not erase delivery counts or stop admission early.

For manual testing, add `BANK_KEEP_RUNNING=1` to the focused command. Reset the
bank as above, then replay `identity-rotation-plan.json` from `inbound-sessions`
to a fresh output directory. Change its claim to `role` and expect a nonzero
exit with `identity verification failed`, despite successful bank requests.


## Supply synthesized session fields to existing transforms

```sh
PROXYMOCK_BIN=/tmp/proxymock-load-plans make bank-load-synthesis
```

The focused loop maps four recorded writer sources, split into two groups, onto
four real prepared bank accounts. Each source runs twice with a fresh login,
JWT and execution ID. A live account response supplies the ID used by subsequent
transaction paths. The app verifies ownership and idempotency. Missing accounts
fail login; a shared username fails the identity objective even when HTTP
requests succeed; omitting account correlation fails real ownership checks.
The statement dependency remains mocked by proxymock and the app remains real.

Add fields under a session group's existing population policy, for example:

```json
{
  "size": 2,
  "reuse": "LOAD_SESSION_REUSE_ROTATE",
  "identityFields": [
    {"name": "bank_username", "pattern": "bank-bank-v1-{n}@example.com"}
  ]
}
```

This seeds `bank_username` in each execution's variable cache. An existing
`http_req_body` → `json_path(username)` → `var_load(bank_username)` transform
applies it to login. Defining a field does not itself rewrite traffic or provision
an account. Use the existing credential/secret workflow for credentials; field
patterns are saved as plain configuration. Enable `identityVerification` to
assert distinct observed JWT actors; a generated string alone is not evidence.

The placeholders reuse `sessionreplay`: `{n}` is the global zero-based slot index,
`{ordinal}` is zero in this breakpoint, and `{session}` is the existing short
source-ID digest. The digest is not a uniqueness guarantee. Active session groups
consume consecutive slots in configuration order, so two populations of size two
use 0/1 and 2/3. Disabled groups consume none. This matches the existing
`session_index` variable and accepted JWT blueprint patterns. A source keeps its
assignment through rotations and repeats. Reproducing the mapping requires the
same saved plan, resolved seed and recording; changing order, population or seed
can reassign sources. Generic compiler preview JSON shows slot indices but omits
synthesized values; the product readiness UI is a separate remaining integration.

Fields allow at most 32 entries. Names are ASCII identifiers up to 64 characters;
patterns contain 1–1024 bytes and only the supported placeholders. Constants are
allowed. Duplicate names, malformed placeholders and the reserved variables
`session_index`, `session_ordinal`, `session_id`, `load_group_id` fail before
traffic. Response transforms may overwrite a value during a journey; the next
execution receives the original compiled assignment in a fresh cache. Populations
larger than their eligible source count are still rejected.

For manual testing, add `BANK_KEEP_RUNNING=1` to `make bank-load-synthesis`.
Use the printed `manual.json` paths: this profile retains `inbound-synthesis`
with the matching login/account transforms. After resetting the bank, replay
`synthesis-rotation-plan.json` using that input and a fresh output directory.
The original `inbound-sessions` keeps its original transforms for earlier cases.
