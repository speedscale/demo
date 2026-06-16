# WireMock Export Demo

Speedscale records real traffic. WireMock serves stub mappings. This demo shows
that the two connect: take a Speedscale recording, run `proxymock export
wiremock`, and load the result into a **real, unmodified WireMock server** —
which then serves the recorded responses.

Because the output is standard WireMock stub-mapping JSON (`{"mappings": [...]}`),
the same file also loads into any other WireMock-compatible mock server.

## What's here

| Path | Purpose |
| --- | --- |
| `proxymock/recording/banking-gateway/` | A small Speedscale recording (4 endpoints from the banking demo's API gateway). |
| `mappings.json` | The recording exported to WireMock format. Committed so the demo runs even before `proxymock export wiremock` ships. |
| `run-demo.sh` | Exports → starts WireMock in Docker → imports → replays → verifies. |

The recorded endpoints:

- `GET  /api/accounts`
- `GET  /api/transactions`
- `GET  /api/users/profile`
- `POST /api/users/login`

All response bodies are synthetic banking-demo data; auth tokens were already
DLP-redacted at capture time.

## Run it

```bash
./run-demo.sh
```

Requirements: Docker and `python3`. A proxymock build that includes
`export wiremock` is optional — if present, the script regenerates
`mappings.json` from the recording to prove the export; if not, it uses the
committed `mappings.json`.

Expected output:

```
==> Importing mappings into WireMock
    import HTTP 200
    loaded 4 stub(s)
==> Replaying recorded endpoints against the mock
    OK   GET   /api/accounts          -> 200  matched stub a1b2c3d4  (364-byte body)
    OK   GET   /api/transactions      -> 200  matched stub ...       (34771-byte body)
    OK   GET   /api/users/profile     -> 200  matched stub ...       (242-byte body)
    OK   POST  /api/users/login       -> 200  matched stub ...       (338-byte body)
==> Negative control
    GET /api/not-recorded -> 404 (expected 404)
==> PASS: Speedscale recording served by a real WireMock instance.
```

The `Matched-Stub-Id` header (printed as the matched stub) is WireMock itself
reporting which exported stub it routed the request to — proof the request went
through WireMock's matching engine rather than a fallthrough. The 404 negative
control confirms WireMock only answers paths that came from the recording.

## How the export maps to WireMock

Each recorded request/response pair becomes one stub mapping:

- **request** — `method` + `urlPath` (path only); recorded query parameters
  become `queryParameters` `equalTo` matchers. Request headers are intentionally
  **not** turned into matchers, so stubs match on method + path and aren't
  over-constrained by per-request headers (auth tokens, user-agents, etc.).
- **response** — `status`, `headers`, and the recorded `body`, byte-for-byte.
- `persistent: true` and a stable `id` (the RRPair UUID) are emitted so
  WireMock-compatible runners that persist stubs keep them across restarts.

## Regenerate the mappings yourself

```bash
proxymock export wiremock \
  --in proxymock/recording \
  --out mappings.json \
  --inbound-only=false \
  --service banking-gateway
```
