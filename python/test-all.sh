#!/bin/bash
set -euo pipefail

HOST="${1:-localhost:5001}"

pass() { printf "\033[32m✓\033[0m %s\n" "$1"; }
fail() { printf "\033[31m✗\033[0m %s\n" "$1"; exit 1; }

check() {
  local label=$1 path=$2 jq_filter=${3:-.}
  resp=$(curl -sf "http://${HOST}${path}") || fail "$label — no response"
  echo "$resp" | jq -e "$jq_filter" >/dev/null 2>&1 || fail "$label — bad payload"
  pass "$label"
}

check "healthz"          /healthz              '.status == "ok"'
check "catalog"         /catalog              '.huggingface[0] and .openrouter[0]'
check "models"           /models               '.[0].id'
check "model detail"     /models/deepseek-ai/DeepSeek-R1  '.id'
check "llm/models"       /llm/models           '.data[0].id'
check "nasa"             /nasa                 '.title'
check "events"           /events               '.[0].type'

resp=$(curl -sf -X POST "http://${HOST}/tickets" -H 'Content-Type: application/json' \
  -d '{"from": "Ada Lovelace <ada@example.edu>", "subject": "Login"}') || fail "tickets — no response"
echo "$resp" | jq -e '.queue == "education" and .auto_reply == true' >/dev/null 2>&1 || fail "tickets — bad payload"
pass "tickets"

echo ""
echo "All endpoints OK"
