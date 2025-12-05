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
