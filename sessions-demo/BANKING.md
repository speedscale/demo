# Banking load-plan fixture

This extends the existing Sessions demo. It supplies real HTTP journeys and an
independent app journal for S-13073. The fixture driver creates recordings; it is
not a replacement for testing the new generator scheduler. Independent HTTP
concurrency and scheduled request/session arrivals are available as an internal test
breakpoint; see [LOAD-GROUPS.md](LOAD-GROUPS.md) for actual proxymock replay
validation. The full release, Kraken job and customer docs remain in development.

## Local loop

Use Node 20.3+ (no packages to install):

```sh
make test
BANK_TEST_MODE=1 BANK_CONTROL_TOKEN=local-bank node server.js
```

In another terminal:

```sh
BANK_CONTROL_TOKEN=local-bank BANK_JOURNAL=/tmp/bank-journal.json node client/banking.js
BANK_CONTROL_TOKEN=local-bank BANK_MODE=requests node client/banking.js
BANK_CONTROL_TOKEN=local-bank BANK_MODE=mixed node client/banking.js
```

Each driver run resets state, visits all 12 prepared actors with concurrency
three, and checks the app journal. Readers have short/long statement journeys;
writers post and retry a transaction, verifying one balance change. Session mode
logs in and correlates the returned token, execution ID and account ID. Request
mode uses prepared credentials and no execution lifecycle; mixed mode uses both.
An anonymous health request supplies background traffic.

For larger recordings start the app with `BANK_POPULATION=1000`. Actor names are
deterministic under `BANK_SEED` (default `bank-v1`). `BANK_FRESH_IDS=1` makes account
and execution IDs fresh to test correlation. The driver fetches fixtures after
each reset, so both modes use valid IDs. Banking login only accepts seeded actors
with their demo password; JWT signatures and account ownership are checked.

## Record journeys

```sh
BANK_TEST_MODE=1 BANK_CONTROL_TOKEN=local-bank proxymock record --app-port 3000 --out /tmp/bank-inbound -- node server.js
```

In another terminal route workload traffic through the inbound proxy. Controls
go directly to the app so the recording does not contain reset calls or the
prepared-credential inventory:

```sh
BASE=http://localhost:4143 CONTROL_BASE=http://localhost:3000 BANK_CONTROL_TOKEN=local-bank node client/banking.js
```

## Endpoints and oracle

| Endpoint | Purpose |
|---|---|
| `POST /bank/login` | Seeded actor credentials → real JWT and fresh execution ID |
| `GET /bank/account` | Authenticated actor's account ID and balance |
| `GET /bank/accounts/:id/statements` | Statement work holds a bounded pool permit |
| `POST /bank/accounts/:id/transactions` | Integer-cent posting with per-account idempotency key |
| `POST /bank/logout` | Complete the execution named by `X-Bank-Execution` |
| `GET /bank/testing/fixtures` | Prepared actors and credentials for independent requests |
| `GET /bank/testing/journal` | Arrivals, outcomes, actor/execution identities, pool waits, transactions |
| `POST /bank/testing/reset` | Reset state and work profile; rejects while requests are active |

Testing routes require `X-Bank-Control: <BANK_CONTROL_TOKEN>` and exist only with
`BANK_TEST_MODE=1`. Each session request after login carries `X-Bank-Execution`;
unknown, foreign and completed executions fail. Tokens alone enable deliberate
standalone requests. Never include the testing routes in replay input.

Reset accepts `isolated` (boolean), `statementWorkMs` and `postingWorkMs`
(0–5000). Statement work shares the posting pool by default. Isolation puts
statements in a separate pool. `BANK_SLOTS` sets pool capacity (default two);
the queue is bounded and overflow returns 503. Tests hold a real downstream HTTP
response open and observe posting queue, then release it to verify recovery.
The control case proves posting completes before the dependency is released.
This avoids relying on narrow wall-clock latency assertions.

The journal is bounded at 100,000 events; `journalDropped > 0` invalidates complete
coverage evidence. Counters keep counting after journal overflow. It records
authenticated identities and final HTTP status, never raw auth tokens. Controls
are excluded from workload counts. The general `/health` endpoint is intentionally
outside the bank journal and is checked separately by the driver.

## Dependency boundary for proxymock

Start the deterministic real dependency with `make bank-dependency`. Set
`BANK_DEPENDENCY_URL=http://localhost:3001` on the app. A statement issues a real
HTTP request to `/statement-data?account=<id>` while holding its pool permit.
Non-2xx, invalid payload, connection failure and a two-second timeout return 502;
there is no success fallback. Without this URL the fixture uses inline statement
data for focused tests; that mode does not validate proxymock integration.

Use proxymock's reverse mapping to record/mock this boundary even when the Node
runtime does not honor proxy environment variables:

```sh
make bank-proxymock
# Or validate a candidate binary:
PROXYMOCK_BIN=/absolute/path/to/proxymock make bank-proxymock
```

To build the candidate yourself, check out the Speedscale artifact-preservation
fix (S-13090), or the load-plan foundation branch that includes it, then run from
that repository's root:

```sh
go build -o /tmp/proxymock-load-plans ./speedctl/cmd/proxymock
```

Back in this demo's `sessions-demo` directory, run:

```sh
PROXYMOCK_BIN=/tmp/proxymock-load-plans make bank-proxymock
```

Success prints a JSON object with `"success":true` and the artifact directory.
`make test` should pass six tests. This command validates the selection
foundation and banking/dependency fixture. Use `make bank-load-groups` with the
S-13080 candidate for actual endpoint-group concurrency, rotating sessions and
scheduled request/session arrivals, including deliberate delivery failures.

The harness chooses unused ports, records the real dependency, waits for the
expected fixture count to reach disk, stops the real dependency, then runs all
three workload modes with `--no-passthrough`. An unrecorded account must return
404 at the mock and a writer's unrecorded statement request must propagate as
502 at the app. Both responses and the negative app journal are retained in
`missing-mock.json`. It retains recording/mocked files, app journals, process logs, seed,
versions, demo revision/dirty state and result in a unique temporary directory
printed on exit. `BANK_ARTIFACTS` can name an existing parent output directory.
Run the same command to regenerate fixtures. The seed is fixed to `bank-v1` in
this baseline harness; use the local driver for other seeds/populations.

The complete-artifact check exposed a timestamp-collision overwrite bug in the
existing reporter (S-13090). Use a candidate containing that fix for reliable
concurrent capture. The harness deliberately fails when successful app responses
are missing from saved artifacts; it does not relax that requirement for older
binaries. Fail-closed misses are checked separately through HTTP and app evidence.

This is the first dependency harness, not the full generator/Kraken acceptance
matrix or a portable reproduction bundle yet. It exercises the installed binary
unless `PROXYMOCK_BIN` is set. Keep ledger updates, authentication and the bounded
pool in the real app in every mode. Candidate container builds can reuse this
demo's existing Dockerfile; no Docker daemon is required to run these tests.
