#!/bin/bash
# Sends Session calls whose token claims the server Base64-decodes: valid
# claims of several sizes, and claims a decoder has to reject.
set -euo pipefail
HOST="${1:-localhost:4143}"
SECRET=speedscale-demo-secret
FAR=4102444800
QUERY='query Session($token: String!, $requestId: String!) {
  session(token: $token, requestId: $requestId) {
    userId
    expiresAt
    requestId
  }
}'
N=0

b64url() { base64 | tr '+/' '-_' | tr -d '=\n'; }
sign() { printf '%s' "$1" | openssl dgst -sha256 -hmac "$SECRET" -binary | b64url; }
repeat() { printf "$1%.0s" $(seq 1 "$2"); }
claims() { printf '{"exp":%s,"iat":1700000000,"sub":"%s"}' "$2" "$1" | b64url; }
HEADER="$(printf '%s' '{"alg":"HS256","typ":"JWT"}' | b64url)"

# send <label> <token>
send() {
  N=$((N + 1))
  local body out
  body="$(jq -n --arg q "$QUERY" --arg t "$2" --arg r "fast-lane-$N" \
    '{query: $q, operationName: "Session", variables: {requestId: $r, token: $t}, extensions: null}')"
  out="$(curl -s -X POST "http://$HOST/graphql" -H 'Content-Type: application/json' -d "$body")"
  printf '%-28s %s\n' "$1" "$(jq -c '.errors[0].message // .data.session.userId' <<<"$out" | cut -c1-48)"
}
# session <label> <claims segment>: a correctly signed token, so the claims reach the decoder
session() {
  local sig
  sig="$(sign "$HEADER.$2")"
  send "$1" "$HEADER.$2.$sig"
}

for n in 6 20 40 100 300 1000; do
  session "valid, $n-char sub" "$(claims "$(repeat u "$n")" "$FAR")"
done
session "valid, under 32 chars" "$(printf '{"exp":%s}' "$FAR" | b64url)"
session "expired" "$(claims u-expired 946684800)"

GOOD="$(claims "$(repeat u 300)" "$FAR")"
session "illegal char at start" "*${GOOD:1}"
session "illegal char mid-block" "${GOOD:0:100}*${GOOD:101}"
session "illegal char at end" "${GOOD%?}*"
session "plus from standard alphabet" "${GOOD:0:70}+${GOOD:71}"
session "slash from standard alphabet" "${GOOD:0:200}/${GOOD:201}"
session "truncated by one" "${GOOD%?}"
session "truncated by two" "${GOOD%??}"
session "truncated by three" "${GOOD%???}"
session "one padding char added" "$GOOD="
session "two padding chars added" "$GOOD=="
session "valid Base64, not JSON" "$(printf 'these claims decode cleanly but are not a JSON document' | b64url)"
session "empty claims" ""
send "bad signature" "$HEADER.$GOOD.$(repeat A 43)"
send "not a JWT" "$HEADER.$GOOD"
