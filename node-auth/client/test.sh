#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-3000}"
BASE="http://localhost:${PORT}"

echo "=== Testing all endpoints on port $PORT ==="
echo ""

# ── OAuth2 token endpoint ────────────────────────────────────────────────
# The client authenticates with HTTP Basic (client_id:client_secret) and asks
# for a token via the client_credentials grant.
echo "--- POST /oauth/token (client_credentials, client demo-client) ---"
curl -s -u 'demo-client:demo-secret' \
  --data-urlencode 'grant_type=client_credentials' \
  --data-urlencode 'scope=read write' \
  "${BASE}/oauth/token" | jq .
echo ""

# Resource Owner Password grant: the client still Basic-authenticates, and
# relays the end-user's username/password in the body.
echo "--- POST /oauth/token (password grant, user admin) ---"
curl -s -u 'partner-app:partner-secret' \
  --data-urlencode 'grant_type=password' \
  --data-urlencode 'username=admin' \
  --data-urlencode 'password=secret123' \
  "${BASE}/oauth/token" | jq .
echo ""

echo "--- POST /oauth/token (bad client secret -> 401 invalid_client) ---"
curl -s -u 'demo-client:wrong-secret' \
  --data-urlencode 'grant_type=client_credentials' \
  "${BASE}/oauth/token" | jq .
echo ""

# ── Bearer-protected resource ────────────────────────────────────────────
echo "--- GET /protected (with valid token) ---"
TOKEN=$(curl -s -u 'demo-client:demo-secret' \
  --data-urlencode 'grant_type=client_credentials' \
  --data-urlencode 'scope=read' \
  "${BASE}/oauth/token" | jq -r '.access_token')
curl -s -H "Authorization: Bearer ${TOKEN}" "${BASE}/protected" | jq .
echo ""

echo "--- GET /protected (no token -> 401) ---"
curl -s "${BASE}/protected" | jq .
echo ""

echo "--- GET /public ---"
curl -s "${BASE}/public" | jq .
echo ""

# ── HTTP Basic protected resources (end-user credentials) ────────────────
echo "--- GET /basic/protected (user1) ---"
curl -s -u 'user1:password1' "${BASE}/basic/protected" | jq .
echo ""

echo "--- GET /basic/admin (admin / secret123) ---"
curl -s -u 'admin:secret123' "${BASE}/basic/admin" | jq .
echo ""

# Same username, rotated secret. Recording both admin calls yields two distinct
# (admin, <pass>) credentials so the credentials-swap dataframe lands two
# separate rows for the same user.
echo "--- GET /basic/admin (admin / secret456, rotated password) ---"
curl -s -u 'admin:secret456' "${BASE}/basic/admin" | jq .
echo ""

echo "--- GET /basic/status (readonly) ---"
curl -s -u 'readonly:readerpass' "${BASE}/basic/status" | jq .
echo ""

# ── PII demo endpoints (synthetic data for "Identify PII") ────────────────
# These exercise PII across response bodies, request bodies, query params, a
# response header, and JWT claims so proxymock's PII detection has a variety
# to discover. All data is fake (public test cards, 555 phones, example.com).
echo "--- GET /customers (response-body PII, many records) ---"
curl -s "${BASE}/customers" | jq .
echo ""

echo "--- GET /customers/:id (PII body + X-Customer-Email header) ---"
curl -s -D - "${BASE}/customers/7c9e6679-7425-40de-944b-e07fc1f90ae7" | sed -n '1,40p'
echo ""

echo "--- POST /customers (PII in request body) ---"
curl -s -X POST "${BASE}/customers" \
  -H 'Content-Type: application/json' \
  -d '{"name":"Dave Singh","email":"dave.singh@example.com","phone":"+14155550133","ssn":"555-12-3456","creditCard":"4242424242424242","dateOfBirth":"1988-07-21"}' | jq .
echo ""

echo "--- GET /orders/:id (nested payment PII) ---"
curl -s "${BASE}/orders/ord-1001" | jq .
echo ""

# --data-urlencode keeps curl from turning the leading + into a space.
echo "--- GET /search (PII in query parameters) ---"
curl -s -G "${BASE}/search" \
  --data-urlencode 'email=bob.martinez@example.org' \
  --data-urlencode 'phone=+14155550199' | jq .
echo ""

echo "--- GET /me (Bearer; PII profile + JWT id_token with PII claims) ---"
ME_TOKEN=$(curl -s -u 'partner-app:partner-secret' \
  --data-urlencode 'grant_type=password' \
  --data-urlencode 'username=admin' \
  --data-urlencode 'password=secret123' \
  "${BASE}/oauth/token" | jq -r '.access_token')
curl -s -H "Authorization: Bearer ${ME_TOKEN}" "${BASE}/me" | jq .
echo ""

echo "=== Done ==="
