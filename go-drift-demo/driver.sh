#!/usr/bin/env bash
# driver.sh — exercise every endpoint of the drift demo so a single
# proxymock recording captures a known traffic shape. Run the demo,
# point proxymock at it, run this script, stop the recording. Repeat
# 2–3 times to produce recorded-* directories that diverge in the
# documented drift fields.
#
# The driver itself ALSO contributes to IN-direction drift: every call
# uses freshly-generated values for the user/cart/session/request IDs
# so two consecutive runs of this script naturally produce different
# inbound payloads.

set -euo pipefail

# Default points at proxymock's inbound proxy, not the app's port. The
# Makefile sets HOST too; this default keeps the script useful when
# invoked by hand against the same setup. To bypass proxymock and hit
# the app directly (debug only — produces no recording) run with
# HOST=http://localhost:8080.
HOST="${HOST:-http://localhost:4143}"
COUNT="${COUNT:-5}"  # how many times to hit each endpoint per invocation

rand_id() {
  # 8 random hex chars — short, readable in markdown recordings.
  head -c 4 /dev/urandom | xxd -p
}

now_epoch() { date +%s; }

echo "exercising drift demo at $HOST (each endpoint $COUNT times)"

for i in $(seq 1 "$COUNT"); do
  rid=$(rand_id)

  # POST /checkout — drift in body fields user_id/cart_id/session_id
  curl -sS -o /dev/null -X POST "$HOST/checkout" \
    -H "Content-Type: application/json" \
    -H "X-Request-Id: req-$rid" \
    -d "{\"user_id\":\"user-$(rand_id)\",\"cart_id\":\"cart-$(rand_id)\",\"session_id\":\"sess-$(rand_id)\",\"items\":[\"widget\",\"gear\"]}"

  # GET /search — drift in query params session and _t
  curl -sS -o /dev/null \
    -H "X-Request-Id: req-$(rand_id)" \
    "$HOST/search?q=widget&session=sess-$(rand_id)&_t=$(now_epoch)"

  # GET /profile/u42 — same path every time, headers drift
  curl -sS -o /dev/null \
    -H "X-Request-Id: req-$(rand_id)" \
    -H "X-Forwarded-For: 10.0.$((RANDOM % 256)).$((RANDOM % 256))" \
    "$HOST/profile/u42"

  # GET /cat-fact — calls the public Cat Facts API (no key needed)
  curl -sS -o /dev/null \
    -H "X-Request-Id: req-$(rand_id)" \
    "$HOST/cat-fact"
done

echo "done. Stop the recording and run the driver again to produce another snapshot."
