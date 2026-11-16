# WireMock Export Demo

Speedscale records real traffic. WireMock serves stub mappings. This demo shows
that the two connect: take a Speedscale recording, run `proxymock export
wiremock`, and load the result into a **real, unmodified WireMock server** —
which then serves the recorded responses.

Because the output is standard WireMock stub-mapping JSON (`{"mappings": [...]}`),
the same file also loads into any WireMock-compatible runner, e.g.
[mocknest-serverless](https://github.com/elenavanengelenmaslova/mocknest-serverless).

## What's here

| Path | Purpose |
| --- | --- |
| `proxymock/recording/banking-gateway/` | A small Speedscale recording (4 endpoints from the banking demo's API gateway). |
| `mappings.json` | The recording exported to WireMock format. Committed so the demo runs without proxymock. |
| `run-demo.sh` | The steps below as one script, with checks. |

The recorded endpoints:

- `GET  /api/accounts`
- `GET  /api/transactions`
- `GET  /api/users/profile`
- `POST /api/users/login`

All response bodies are synthetic banking-demo data; auth tokens were already
DLP-redacted at capture time.

## Run it

You need Docker and `curl`. Run every command from this directory.

### 1. Export the recording (optional)

`mappings.json` is already committed. To produce it yourself from the
recording, run:

```bash
proxymock export wiremock \
  --in proxymock/recording \
  --out mappings.json \
  --inbound-only=false \
  --service banking-gateway
```

### 2. Start WireMock with the mappings

WireMock loads every file in its `mappings/` folder at startup, so mounting
the file is all it takes:

```bash
docker run -d --rm --name wiremock-export-demo -p 8080:8080 \
  -v "$PWD/mappings.json:/home/wiremock/mappings/mappings.json:ro" \
  wiremock/wiremock:3.9.1
```

If port 8080 is taken, use another one, for example `-p 8181:8080`, and use
that port in the commands below. Check that the 4 stubs loaded:

```bash
curl -s localhost:8080/__admin/mappings | grep -o '"total" : [0-9]*'
```

```
"total" : 4
```

### 3. Call the recorded endpoints

```bash
curl -i localhost:8080/api/accounts
curl -i localhost:8080/api/transactions
curl -i localhost:8080/api/users/profile
curl -i -X POST localhost:8080/api/users/login -H 'Content-Type: application/json' -d '{}'
```

Each returns 200 with the recorded body. Look for the `Matched-Stub-Id`
response header: it is WireMock reporting which exported stub answered,
which shows the request went through WireMock's matching rather than a
fallthrough. The id is the recorded RRPair's id.

```
HTTP/1.1 200 OK
Content-Type: application/json
Matched-Stub-Id: f25df318-...
```

### 4. Call something that was never recorded

```bash
curl -i localhost:8080/api/not-recorded
```

WireMock answers 404 "Request was not matched": it only serves what came from
the recording.

### 5. Clean up

```bash
docker stop wiremock-export-demo
```

`./run-demo.sh` does steps 1 to 4 in one go and checks each result. If
proxymock is installed, it regenerates `mappings.json` from the recording
first.

## How the export maps to WireMock

Each recorded request/response pair becomes one stub mapping:

- **request** — `method` + `urlPath` (path only); recorded query parameters
  become `queryParameters` `equalTo` matchers. Request headers are intentionally
  **not** turned into matchers, so stubs match on method + path and aren't
  over-constrained by per-request headers (auth tokens, user-agents, etc.).
- **response** — `status`, `headers`, and the recorded `body`, byte-for-byte.
- `persistent: true` and a stable `id` (the RRPair UUID) are emitted so
  WireMock-compatible runners that persist stubs keep them across restarts.
