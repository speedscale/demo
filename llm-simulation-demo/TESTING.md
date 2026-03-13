# LLM Simulation Demo — Test Design & Guide

## Overview

Tests are split across two suites that can be run independently:

| Suite | Location | Framework | Runs without API keys |
|---|---|---|---|
| Backend | `backend/tests/` | pytest + httpx ASGI | Yes — all adapters are mocked |
| Frontend | `frontend/src/__tests__/` | Jest + React Testing Library | Yes — fetch is mocked |

No test makes a real HTTP call to an LLM provider or external service.

---

## Backend

### Setup

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
```

### Run

```bash
# All tests
pytest

# With verbose output
pytest -v

# One file
pytest tests/test_simulation.py -v

# One test class
pytest tests/test_simulation.py::TestFallback -v

# Coverage report
pytest --cov=app --cov-report=term-missing
```

### Test files

#### `tests/test_models.py` — Pydantic model validation

Verifies that every model accepts valid data, rejects missing required fields, enforces
constraints (e.g. `inject_latency_ms >= 0`), and round-trips through JSON serialisation.

| Class | What it covers |
|---|---|
| `TestTicketInput` | Valid construction, missing field rejects |
| `TestSimulationConfig` | Defaults, full override, negative latency rejected |
| `TestRunRequest` | Minimal + full construction, missing input rejects |
| `TestOutputEnvelope` | Valid construction, missing field rejects |
| `TestToolCallRecord` | ok and error records |
| `TestRunResultSerialization` | JSON round-trip, SimulationEcho defaults |

#### `tests/test_tools.py` — `/tools/*` chaos endpoints

Uses `httpx.ASGITransport` to call the tool endpoints directly.  Verifies every
injectable failure mode without hitting any real service.

| Class | What it covers |
|---|---|
| `TestOrderTool` | Normal response, 500, 429, malformed fields, order_id echo |
| `TestPolicyTool` | Normal response, 500, malformed fields, policy_id echo |
| `TestChaosResponseLogic` | Unknown status falls through, small delay works, negative delay rejected |

#### `tests/test_providers.py` — provider adapter logic

Pure unit tests: the `_parse_output` helper functions and `build_user_message` are tested
without any HTTP calls.  The full `adapter.run()` path is tested with `unittest.mock.patch`
on `httpx.AsyncClient.post`.

| Class | What it covers |
|---|---|
| `TestBuildUserMessage` | All ticket fields present, labels formatted |
| `TestOpenAIParse` | Valid JSON, missing field default, invalid JSON raises 502 |
| `TestAnthropicParse` | Valid JSON, invalid JSON raises 502 |
| `TestGeminiParse` | Valid JSON, wrong type raises 502 |
| `TestOpenAIAdapterRun` | Happy path, missing key 503, 429 error, 5xx error |
| `TestAnthropicAdapterRun` | Happy path, missing key 503, 429 error |
| `TestGeminiAdapterRun` | Happy path, missing key 503 |

#### `tests/test_routes.py` — FastAPI route integration

Every route is tested with a real ASGI test client.  Provider adapters and `_call_tool`
are patched so no network calls happen.

| Class | What it covers |
|---|---|
| `TestHealthz` | `GET /healthz` returns `{"status": "ok"}` |
| `TestProviders` | Three providers returned, required keys present, `configured=False` without env keys |
| `TestScenarios` | Five scenarios returned, required keys present, known IDs present |
| `TestRunScenario` | Known scenario runs, unknown returns 404, all five scenarios execute |
| `TestRunTask` | Happy path shape, unknown provider 400, missing input 422, run stored + retrievable, request_id prefix |
| `TestListRuns` | Returns `runs` + `total`, limit param respected |
| `TestGetRun` | Unknown run returns 404 |

#### `tests/test_simulation.py` — simulation logic (core demo behaviors)

The most important test file.  Every simulation behavior the demo is built to showcase is
verified here.

| Class | What it covers |
|---|---|
| `TestFallback` | 429 triggers fallback, no fallback when unset, primary success skips fallback, both fail returns degraded output, same-provider fallback ignored |
| `TestLatencyInjection` | Delay applied (±10%), zero delay fast, latency echoed in response |
| `TestToolStatusInjection` | `inject_status=500` propagates to order tool, status echoed |
| `TestMalformedToolJson` | Flag echoed, order tool result has `_old_`-prefixed keys |
| `TestSimulationEcho` | All three echo fields reflect the request |

---

## Frontend

### Setup

```bash
cd frontend
npm install
```

### Run

```bash
# All tests
npm test

# Watch mode (re-runs on save)
npm test -- --watch

# Coverage
npm run test:coverage

# One file
npm test -- SeverityBadge
```

### Test files

#### `src/__tests__/components/SeverityBadge.test.tsx`

| Test | Verifies |
|---|---|
| Renders text for all four severities | `low`, `medium`, `high`, `critical` all display |
| Unknown severity does not crash | Graceful fallback to grey |
| uppercase CSS class applied | Text styling consistent |
| Correct hex color per severity | `high` → `#f97316`, `critical` → `#ef4444`, etc. |
| Fallback grey for unknown | `#9ca3af` applied |

#### `src/__tests__/components/ToolCallList.test.tsx`

| Test | Verifies |
|---|---|
| Empty array renders nothing | No DOM nodes emitted |
| Tool name rendered | `lookup_order` visible |
| Duration in ms rendered | `84ms` visible |
| Error message shown for error status | `HTTP 500` visible |
| No error span for ok status | Error text absent |
| Multiple tools rendered | Both names visible |
| Timeout error message shown | Error text visible |
| Durations for all tools | Both `84ms` and `12ms` visible |

#### `src/__tests__/components/ResultCard.test.tsx`

| Test group | Verifies |
|---|---|
| Basic rendering | Summary, recommended action, request ID, provider, timing values |
| Severity badge | Correct text, reflects different severities |
| Fallback badge | Hidden when `false`, shown when `true` |
| Provider error badge | Hidden without error, shown when error present |
| Tool calls | Names rendered, empty list hides section, error details shown |

#### `src/__tests__/lib/api.test.ts`

All `fetch` calls are mocked with `jest.fn()`.  Tests verify correct HTTP method, URL,
headers, body serialization, and error handling for non-ok responses.

| Function | Tests |
|---|---|
| `runTask` | POSTs to `/api/run`, sends `Content-Type`, serializes body, throws on 404/500 |
| `getProviders` | GETs `/api/providers`, returns parsed data, throws on 503 |
| `getScenarios` | GETs `/api/scenarios`, returns scenario list |
| `getRun` | GETs `/api/runs/{id}`, throws on 404 |
| `listRuns` | GETs `/api/runs`, default limit, custom limit in query string |

---

## Design principles

### No real network calls
Every test that exercises code which makes HTTP requests stubs the transport layer
(`httpx.ASGITransport` for the backend, `jest.fn()` mock for `fetch` in the frontend).
This means the full suite can run in CI without any API keys.

### Test each layer in isolation
- Models are tested without a server.
- Provider parse logic is tested without HTTP.
- Route logic is tested with mocked adapters.
- Simulation logic is tested with both real tool endpoints (via ASGI) and mocked adapters.
- Frontend components are tested without a backend.
- The API client is tested without a running server.

### Test the demo's own story
The simulation tests in `test_simulation.py` directly mirror the failure modes described
in the app — each test case corresponds to something a user can click in the UI.  If a
demo behavior breaks, a test fails.
