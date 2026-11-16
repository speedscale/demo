#!/usr/bin/env bash
# Drives the booking journeys: search, cart, price, checkout, order lookup, plus three error paths.
# Usage: demo/drive.sh [base-url]   (default http://localhost:4143, the proxymock inbound proxy)
set -euo pipefail
BASE="${1:-http://localhost:4143}"
J='Content-Type: application/json'

call() { # method path [body]
  local out
  if [ $# -ge 3 ]; then out=$(curl -sS -X "$1" -H "$J" -d "$3" "$BASE$2" -w ' [%{http_code}]'); else out=$(curl -sS -X "$1" "$BASE$2" -w ' [%{http_code}]'); fi
  echo "$1 $2 -> ${out: -5}" >&2
  echo "${out% \[*}"
}
field() { python3 -c "import sys,json; print(json.load(sys.stdin)[sys.argv[1]])" "$1"; }

book() { # origin destination date passengers flight fareClass card
  call GET "/api/offers?origin=$1&destination=$2&date=$3" >/dev/null
  local cart; cart=$(call POST /api/carts "{\"passengers\":$4}" | field cartId)
  CARTS+=("$cart")
  call POST "/api/carts/$cart/items" "{\"flightNumber\":\"$5\",\"fareClass\":\"$6\"}" >/dev/null
  call GET "/api/carts/$cart" >/dev/null
  local order; order=$(call POST "/api/carts/$cart/checkout" "{\"cardToken\":\"$7\"}")
  if [ "$7" != tok_decline ]; then
    call GET "/api/orders/$(echo "$order" | field recordLocator)" >/dev/null
  fi
}

CARTS=()
book SLC LAX 2026-12-18 1 DM1201 Y tok_visa_4242
book SLC LAX 2026-12-18 2 DM1205 M tok_amex_0005
book SLC DEN 2026-12-19 3 DM2407 J tok_mc_4444
book LAX SLC 2026-12-21 1 DM1302 Y tok_decline
call POST /api/carts '{"passengers":12}' >/dev/null
call GET /api/orders/ZZZZZZ >/dev/null
call POST "/api/carts/${CARTS[0]}/checkout" '{"cardToken":"tok_visa_4242"}' >/dev/null   # retry after ticketing: 409
