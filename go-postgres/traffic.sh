#!/usr/bin/env bash
# Send demo traffic to go-postgres, by default through proxymock's inbound
# proxy on port 4143 so both the API calls and the database calls are recorded.
#
#   ./traffic.sh                 the standard users requests
#   SHOWCASE=1 ./traffic.sh      the same, then the /showcase requests
#
# The showcase requests need the app started with SHOWCASE=1 as well. Each one
# checks its HTTP status, so the script exits non-zero if the app misbehaves.
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4143}"
failures=0

# call METHOD PATH EXPECTED_STATUS [JSON_BODY]
call() {
  local method=$1 path=$2 want=$3 body=${4:-}
  local args=(-s -o /dev/null -w '%{http_code}' -X "$method" "$BASE_URL$path")
  if [[ -n "$body" ]]; then
    args+=(-H 'Content-Type: application/json' -d "$body")
  fi
  local got
  got=$(curl "${args[@]}" || true)
  if [[ "$got" == "$want" ]]; then
    printf 'ok   %s %-40s %s\n' "$method" "$path" "$got"
  else
    printf 'FAIL %s %-40s got %s, want %s\n' "$method" "$path" "$got" "$want"
    failures=$((failures + 1))
  fi
}

# The standard requests. Their status codes depend on what earlier runs left
# in the users table, so they are sent without checking.
curl -s "$BASE_URL/users" >/dev/null
curl -s -X POST "$BASE_URL/users" -H 'Content-Type: application/json' \
  -d '{"first_name":"Test","last_name":"User","email":"test@example.com","username":"testuser"}' >/dev/null
curl -s -X PUT "$BASE_URL/users/2" -H 'Content-Type: application/json' \
  -d '{"first_name":"Jane","last_name":"Smith","email":"jane.smith@example.com","username":"janesmith","age":29}' >/dev/null
curl -s "$BASE_URL/users" >/dev/null
echo "sent standard requests"

case "${SHOWCASE:-}" in
  1 | true | yes | on) ;;
  *) exit 0 ;;
esac

# Start from the seed rows so ids and errors are the same on every run.
call POST /showcase/reset 200

# Result sets and typed columns: every customer, including NULL nickname and
# avatar, numeric, boolean, bytea and timestamptz values. Then an empty result
# set over the same protocol, which still carries the column names.
call GET /showcase/customers 200
call GET '/showcase/customers?created_after=2030-01-01T00:00:00Z' 200

# Bound statements and result sets: a binary NUMERIC parameter that matches
# several rows, then one that matches none.
call GET '/showcase/products?min_price=5' 200
call GET '/showcase/products?min_price=10000' 200

# Write outcomes: INSERT ... RETURNING id with text, numeric, boolean, bytea,
# timestamptz and NULL parameters.
call POST /showcase/customers 201 \
  '{"email":"barbara@example.com","name":"Barbara Liskov","nickname":null,"credit_limit":1500.75,"is_vip":true,"avatar":"3q2+7w==","created_at":"2025-09-01T12:00:00Z"}'

# Database errors: unique violation (23505) and check violation (23514).
call POST /showcase/customers 409 \
  '{"email":"ada@example.com","name":"Ada Again","credit_limit":10}'
call POST /showcase/customers 422 \
  '{"email":"overdrawn@example.com","name":"Over Drawn","credit_limit":-5}'

# UPDATE that matches several rows, then one that matches none.
call POST /showcase/products/reprice 200 '{"sku_prefix":"TEE-","factor":1.10}'
call POST /showcase/products/reprice 200 '{"sku_prefix":"NOPE-","factor":1.10}'

# Session timeline: a transaction that commits, one that rolls back on
# purpose, and one that rolls back after a foreign key violation (23503).
call POST /showcase/orders 201 '{"customer_id":2,"product_id":1,"quantity":2,"note":"leave at door","receipt":"AQID"}'
call POST /showcase/orders 200 '{"customer_id":3,"product_id":2,"quantity":1,"dry_run":true}'
call POST /showcase/orders 422 '{"customer_id":999,"product_id":1,"quantity":1}'

# Session timeline: N+1, one query for the customers then one per customer.
call GET /showcase/report 200

# DELETE, then a syntax error that carries a character position (42601).
call DELETE /showcase/customers/4 204
call GET /showcase/bad-query 400

if ((failures > 0)); then
  echo "$failures showcase request(s) returned an unexpected status" >&2
  exit 1
fi
echo "sent showcase requests"
