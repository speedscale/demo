#!/bin/bash
set -euo pipefail

HOST="${1:-localhost:8081}"

echo "==> POST /api/auth/session/login"
TOKEN=$(curl -sf -X POST "http://${HOST}/api/auth/session/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"password"}' \
  | jq -r '.accessToken')
echo "  token: ${TOKEN:0:20}..."

echo "==> GET /api/auth/user (1)"
curl -sf "http://${HOST}/api/auth/user" \
  -H "Authorization: Bearer $TOKEN" | jq .

echo "==> GET /api/auth/user (2)"
curl -sf "http://${HOST}/api/auth/user" \
  -H "Authorization: Bearer $TOKEN" | jq .

echo "==> GET /api/auth/user (3)"
curl -sf "http://${HOST}/api/auth/user" \
  -H "Authorization: Bearer $TOKEN" | jq .
