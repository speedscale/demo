# TransformRecommendations Demo

This Node.js / Express app demonstrates all five active `TransformRecommendation` types when you record traffic with `proxymock record`. Each endpoint and its outbound calls produce traffic patterns that the Speedscale analyzer detects and recommends transforms for.

## Recommendation Types Triggered

| # | Type | Enum Value | How It's Detected |
|---|------|-----------|------------------|
| 1 | **DATETIME** | `TRANSFORM_RECOMMENDATION_DATETIME` (3) | Outbound POST body contains an ISO-8601 timestamp. Analyzer recommends replacing with `"IGNORED"` so replays don't fail signature matching on clock values. |
| 2 | **JWT_RESIGN / OAUTH** | `TRANSFORM_RECOMMENDATION_JWT_RESIGN` (1) | Response body contains `access_token`. Analyzer recommends `smart_replace_recorded(overwrite=true)` to propagate fresh tokens from login → downstream calls. |
| 3 | **REQUEST_ID** | `TRANSFORM_RECOMMENDATION_REQUEST_ID` (4) | Both inbound and outbound requests with X-Request-Id header. Analyzer emits two recommendations: inbound replacement with `rand_string`, outbound echo-back via `smart_replace_recorded`. |
| 4 | **DLP** | `TRANSFORM_RECOMMENDATION_DLP` (7) | Outbound POST body contains email, phone, credit card, SSN. Analyzer emits one recommendation per unique `(pattern, host, location, command, jsonPath)` with `dlp_field` transforms. |
| 5 | **DLP_REDACTION** | `TRANSFORM_RECOMMENDATION_DLP_REDACTION` (8) | If DLP redaction is configured at capture time (REDACTED:* placeholders), analyzer emits recommendations to restore stable test values during replay. Requires pre-configured DLP rule via Speedscale cloud or `infra-dlp`. |

> **Note:** `SASL_AUTH` (type 9) requires real MongoDB traffic with `saslStart`/`saslContinue` commands. See the [`demo/go-mongo`](../go-mongo/) directory for a MongoDB SASL auth recommendation example.

## Quick Start

### Prerequisites

- Node.js 18+
- `proxymock` installed ([Getting Started](https://docs.speedscale.com/proxymock/getting-started/))

### Install Dependencies

```bash
npm install
```

### Record Traffic with proxymock record

Run the app under `proxymock record`. This starts both inbound and outbound proxies around your application:

```bash
PORT=3000 proxymock record -- node index.js
```

Or start manually in two steps:

```bash
# Terminal 1 - Start the recording proxy
proxymock record

# Terminal 2 - Start the app (port 3000)
PORT=3000 node index.js
```

The inbound proxy listens on port **4143** and routes traffic to your app on port **3000**.

### Send Test Curl Requests Through Port 4143

Make requests that exercise all the recommendation-triggering endpoints:

```bash
# Health check
curl http://localhost:4143/

# DATETIME: outbound request with timestamp in body
curl -X POST http://localhost:4143/api/report \
  -H "Content-Type: application/json" \
  -d '{"reportName": "weekly-sync"}'

# JWT_RESIGN / OAUTH: auth handshake that returns access_token
curl -X POST http://localhost:4143/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"grantType": "client_credentials"}'

# REQUEST_ID (inbound + outbound): call with X-Request-Id header
curl -X POST http://localhost:4143/api/search \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: my-test-request-id-001" \
  -d '{"query": "sample"}'

# DLP: outbound call with email, phone, credit card, SSN in body
curl -X POST http://localhost:4143/api/customers \
  -H "Content-Type: application/json" \
  -d '{}'

# DLP (response): authenticated profile lookup returns sensitive data
BEARER_TOKEN=$(curl -s -X POST http://localhost:4143/api/auth/token -H "Content-Type: application/json" -d '{}' | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4)
curl http://localhost:4143/api/profile \
  -H "Authorization: Bearer $BEARER_TOKEN"

# DATETIME + REQUEST_ID combined: timestamp in body + X-Request-Id header
curl -X POST http://localhost:4143/api/events \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: events-trace-id-002" \
  -d '{}'
```

### Stop the Recording

Press `Ctrl+C` in the proxymock terminal to stop recording. The traffic is saved to markdown RRPair files under `proxymock-recorded/`.

### Inspect Recorded Traffic

```bash
proxymock inspect
```

This shows what was captured and gives a preview of detected patterns.

### Analyze for TransformRecommendations

Analyze the recorded snapshot to generate full recommendations:

```bash
# Option 1: Push to Speedscale cloud for full analysis with web UI
speedctl push

# Then view in your browser at https://app.speedscale.com
```

Or analyze locally from the recorded directory:

```bash
proxymock analyze --workspace proxymock-recorded/
```

### View Recommendations in Web UI

```bash
proxymock web --workspace proxymock-recorded/
```

The web UI shows each recommendation with:
- Type badge (DATETIME, JWT_RESIGN, REQUEST_ID, DLP, etc.)
- Affected services and endpoints
- Pre-built transform chains that "solve" the tip
- Accept/reject toggle for each recommendation

Accepted recommendations are merged into a per-service tuning blueprint that proxymock applies automatically during replay.

## Expected Recommendations

After recording traffic through all endpoints, you should see at least **7 TransformRecommendations**:

1. **DATETIME** - Replace `generatedAt` timestamps with "IGNORED"
2. **JWT_RESIGN / OAUTH** - Handle access_token propagation from auth endpoint → downstream calls via `smart_replace_recorded(overwrite=true)`  
3. **REQUEST_ID (inbound)** - Replace inbound X-Request-Id headers with fresh random UUIDs per replay
4. **REQUEST_ID (outbound)** - Echo outbound X-Request-Id headers back via `smart_replace_recorded`
5. **DLP** - Redact email, phone, credit card, SSN fields using `dlp_field` transforms
6. **DLP + DLP_REDACTION combined** (if pre-configured) - Request and response body redaction with stable test value restoration
7. **DATETIME + REQUEST_ID combined** - Both patterns detected simultaneously in /api/events traffic

## How It Works Under the Hood

When you run `proxymock record -- node index.js`:

```
For each RRPair:
  DetectDataTokens(rr)     → scans headers, query params, bodies for patterns
  tokenProcessor.Collect() → routes tokens by type (JWT, SQL, datetime, DLP...)
  a.Collect(rr)            → stores in SQLite for latency/segment analytics  

a.CollectTokens(tokens)    → routes into r.jwtTokens, r.dlpTokens, etc.
_, err := a.Run(ctx)       → generates all recommendations:
  calcDLPLocations()        → DLP + DLP_REDACTION
  suggestJWTs()             → JWT_RESIGN / OAUTH  
  suggestDatetimes()        → DATETIME  
  calcHeaderRecommendations()→ REQUEST_ID
  suggestMongoSASL()        → SASL_AUTH
  suggestGrpcTimestamps()   → gRPC timestamps (also DATETIME)
  consolidateTransformRecommendations() → merge similar recs by pattern
```

## API Endpoints

| Route | Method | Triggers Recommendation Type(s) |
|-------|--------|---------------------------------|
| `/` | GET | Health check |
| `/api/report` | POST | DATETIME (3) |
| `/api/auth/token` | POST | JWT_RESIGN / OAUTH (1/2) |
| `/api/data` | POST | JWT propagation (uses token from auth endpoint) |
| `/api/search` | POST | REQUEST_ID (4) inbound + outbound |
| `/api/customers` | POST | DLP (7) sensitive data in body |
| `/api/profile` | GET | DLP response redaction |
| `/api/events` | POST | DATETIME + REQUEST_ID combined |

## Project Structure

```
transform-recommendations-demo/
├── index.js        # Express app with all triggering endpoints and outbound calls  
├── package.json    # Minimal Node.js 18+ dependencies (express only)
└── README.md       # This file
```