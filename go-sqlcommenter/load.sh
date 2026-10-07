#!/usr/bin/env bash
# Send a short, mixed load to go-sqlcommenter, by default through proxymock's
# inbound proxy on port 4143 so both the API calls and the SQL are recorded.
#
#   ./load.sh                                   through proxymock
#   BASE_URL=http://localhost:8080 ./load.sh    straight at the app
#
# Most requests carry a W3C traceparent, as if an upstream service or gateway
# had started the trace. A few carry none, so the app starts the trace itself.
# The /reports/sales requests are sent at the same time and each takes 200 ms,
# so they overlap and timing alone cannot tell their statements apart.
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4143}"
failures=0

new_trace() { openssl rand -hex 16; }
new_span() { openssl rand -hex 8; }

# call METHOD PATH EXPECTED_STATUS TRACE_ID [JSON_BODY]
# An empty TRACE_ID sends no traceparent.
call() {
  local method=$1 path=$2 want=$3 trace=$4 body=${5:-}
  local args=(-s -o /dev/null -w '%{http_code}' -X "$method" "$BASE_URL$path")
  if [[ -n "$trace" ]]; then
    args+=(-H "traceparent: 00-$trace-$(new_span)-01")
  fi
  if [[ -n "$body" ]]; then
    args+=(-H 'Content-Type: application/json' -d "$body")
  fi
  local got
  got=$(curl "${args[@]}" || true)
  if [[ "$got" == "$want" ]]; then
    printf 'ok   %-4s %-16s %s trace %s\n' "$method" "$path" "$got" "${trace:-(started by the app)}"
  else
    printf 'FAIL %-4s %-16s got %s, want %s\n' "$method" "$path" "$got" "$want"
    return 1
  fi
}

# check runs call and counts a failure without stopping the script.
check() { call "$@" || failures=$((failures + 1)); }

echo "== untagged: the health check runs its query with no comment"
check GET /health 200 ""

echo "== one request at a time, each with its own trace"
check GET /products 200 "$(new_trace)"
check GET /orders/1 200 "$(new_trace)"
check POST /orders 201 "$(new_trace)" '{"customer":"grace@example.com","items":[{"product_id":2,"quantity":1},{"product_id":4,"quantity":3}]}'

echo "== four overlapping reports, each with its own trace"
pids=()
for _ in 1 2 3 4; do
  call GET /reports/sales 200 "$(new_trace)" &
  pids+=($!)
done
for pid in "${pids[@]}"; do
  wait "$pid" || failures=$((failures + 1))
done

echo "== product lookups: a prepared statement reused across requests"
for id in 1 2 3 4 5 1 2 3; do
  check GET "/products/$id" 200 "$(new_trace)"
done

echo "== no traceparent: the app starts the trace itself"
check GET /orders/1 200 ""
check GET /products 200 ""

if ((failures > 0)); then
  echo "$failures request(s) failed" >&2
  exit 1
fi
