# Node.js OAuth Authentication Demo

A simple Node.js HTTP server demonstrating OAuth Bearer token authentication.

## Getting Started

### Start the server

```bash
npm start
```

The server will start on `http://localhost:3000`

## API Endpoints

### 1. OAuth Token Endpoint (POST /oauth/token)

Get an access token via OAuth handshake.

```bash
curl -X POST http://localhost:3000/oauth/token
```

Response:
```json
{
  "access_token": "your-token-here",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

### 2. Protected Endpoint (GET /protected)

Requires a valid Bearer token in the Authorization header.

```bash
# With valid token
curl -H "Authorization: Bearer YOUR_TOKEN_HERE" http://localhost:3000/protected

# Without token or with invalid token
curl http://localhost:3000/protected
```

Success Response (200):
```json
{
  "message": "Access granted to protected resource",
  "data": {
    "userId": 123,
    "username": "demo-user"
  }
}
```

Error Response (403):
```json
{
  "error": "forbidden",
  "message": "Invalid or missing Bearer token"
}
```

### 3. Public Endpoint (GET /public)

No authentication required, always returns 200.

```bash
curl http://localhost:3000/public
```

Response (200):
```json
{
  "message": "Public endpoint - no authentication required",
  "data": {
    "timestamp": "2025-12-03T10:00:00.000Z",
    "status": "ok"
  }
}
```

### 4. PII Demo Endpoints

These endpoints return (and accept) a broad spread of **synthetic, fake** PII so
proxymock's "Identify PII" detection has a variety to discover — email
addresses, US SSNs, credit-card numbers, E.164 phone numbers, dates of birth,
IP addresses, and PII embedded in JWT claims. No real data is used (card numbers
are public test numbers; phones use the 555 fictional range).

| Method & path | What it exposes |
|---|---|
| `GET /customers` | List of customers — PII across many response-body records |
| `GET /customers/:id` | One customer, plus an `X-Customer-Email` response header |
| `POST /customers` | PII in the **request** body (echoed back on create) |
| `GET /orders/:id` | Order with nested payment PII (card number, CVV, billing) |
| `GET /search?email=&phone=&ssn=` | PII in **query parameters** |
| `GET /me` | Bearer-protected profile + a signed JWT `id_token` whose **claims** carry PII |

```bash
curl http://localhost:3000/customers
curl http://localhost:3000/orders/ord-1001
# query params (URL-encode the leading + on phones as %2B)
curl "http://localhost:3000/search?email=bob.martinez@example.org&phone=%2B14155550199"

# /me returns an id_token JWT with email / phone_number / birthdate claims
TOKEN=$(curl -s -X POST http://localhost:3000/oauth/token \
  -H "Authorization: Basic cGFydG5lci1hcHA6cGFydG5lci1zZWNyZXQ=" \
  -d "grant_type=password&username=admin&password=secret123" | jq -r .access_token)
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/me
```

## Recording Traffic with ProxyMock

Capture API traffic using the locally installed `proxymock` CLI.

### Start the proxy and your app

```bash
proxymock record --app-port 3000 -- npm start
```

This launches your app on port 3000 behind proxymock's inbound proxy (port 4143). All requests sent to port 4143 are recorded as Speedscale-compatible fixtures.

### Record API calls

Send requests to the inbound proxy port instead of directly to the server:

```bash
# Get a token through the proxy
TOKEN=$(curl -s -X POST http://localhost:4143/oauth/token | jq -r '.access_token')

# Access protected endpoint
curl -H "Authorization: Bearer $TOKEN" http://localhost:4143/protected

# Access public endpoint
curl http://localhost:4143/public
```

### Stop the proxy

Press Ctrl+C in the proxy terminal. Recorded traffic is saved to `proxymock/recorded-<date>/` for later replay.

### View recorded traffic

```bash
proxymock web
```

## Example Flow

1. Get a token:
```bash
TOKEN=$(curl -s -X POST http://localhost:3000/oauth/token | jq -r '.access_token')
```

2. Access protected endpoint:
```bash
curl -H "Authorization: Bearer $TOKEN" http://localhost:3000/protected
```

3. Access public endpoint (no token needed):
```bash
curl http://localhost:3000/public
```
