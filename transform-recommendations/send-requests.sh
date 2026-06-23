#!/usr/bin/env bash
#
# Exercise every TransformRecommendation-triggering endpoint.
#
# Usage:
#   ./send-requests.sh              # hits http://localhost:3000 (the app directly)
#   PORT=4143 ./send-requests.sh    # send through the proxymock inbound proxy
#   HOST=http://other:8080 ./send-requests.sh

set -euo pipefail

PORT="${PORT:-4143}"
HOST="${HOST:-http://localhost:${PORT}}"

CURL_OPTS=(--silent --show-error --fail-with-body)

section() {
  printf '\n\033[1;36m=== %s ===\033[0m\n' "$1"
}

section "Health check"
curl "${CURL_OPTS[@]}" "${HOST}/"
echo

section "DATETIME: outbound request with timestamp in body"
curl "${CURL_OPTS[@]}" -X POST "${HOST}/api/report" \
  -H "Content-Type: application/json" \
  -d '{"reportName": "weekly-sync"}'
echo

section "JWT_RESIGN / OAUTH: Basic auth handshake that returns access_token"
# POST /api/auth/token requires Authorization: Basic (username:password); JSON body is ignored.
AUTH_RESPONSE=$(curl "${CURL_OPTS[@]}" -X POST "${HOST}/api/auth/token" \
  -u "demo-client:demo-secret")
echo "${AUTH_RESPONSE}"

BEARER_TOKEN=$(printf '%s' "${AUTH_RESPONSE}" | grep -o '"access_token":"[^"]*"' | cut -d'"' -f4 || true)
if [[ -z "${BEARER_TOKEN}" ]]; then
  echo "warning: could not extract access_token from auth response" >&2
fi

section "JWT propagation: subsequent Bearer call validates token via /api/auth/validate"
curl "${CURL_OPTS[@]}" -X POST "${HOST}/api/data" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${BEARER_TOKEN}" \
  -d '{"action":"resolve-roles"}'
echo

section "REQUEST_ID (inbound + outbound): call with X-Request-Id header"
curl "${CURL_OPTS[@]}" -X POST "${HOST}/api/search" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: my-test-request-id-001" \
  -d '{"query": "sample"}'
echo

section "DLP: outbound call with email, phone, credit card, SSN in body"
curl "${CURL_OPTS[@]}" -X POST "${HOST}/api/customers" \
  -H "Content-Type: application/json" \
  -d '{}'
echo

section "DLP (response): authenticated profile lookup returns sensitive data"
curl "${CURL_OPTS[@]}" "${HOST}/api/profile" \
  -H "Authorization: Bearer ${BEARER_TOKEN}"
echo

section "DATETIME + REQUEST_ID combined: timestamp in body + X-Request-Id header"
curl "${CURL_OPTS[@]}" -X POST "${HOST}/api/events" \
  -H "Content-Type: application/json" \
  -H "X-Request-Id: events-trace-id-002" \
  -d '{}'
echo

section "Done"
