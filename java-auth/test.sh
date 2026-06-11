#!/bin/bash
set -euo pipefail

HOST="${1:-localhost:4143}"

echo "==> POST /api/auth/login"
TOKEN=$(curl -sf -X POST "http://${HOST}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"demo","password":"password"}' \
  | jq -r '.accessToken')
echo "  token: ${TOKEN:0:20}..."

echo "==> GET /api/auth/user"
curl -sf "http://${HOST}/api/auth/user" \
  -H "Authorization: Bearer $TOKEN" | jq .

echo "==> POST /api/auth/validate"
curl -sf -X POST "http://${HOST}/api/auth/validate" \
  -H "Content-Type: application/json" \
  -d "{\"token\":\"$TOKEN\"}" | jq .
