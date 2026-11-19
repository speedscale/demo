#!/bin/bash
# Sends a mix of logins, token checks and malformed tokens to the auth service.
set -euo pipefail
HOST="${1:-localhost:4143}"
API="http://${HOST}/api/auth"

show() { printf '%s %s\n' "$1" "$2"; }
json() { curl -s -o /dev/null -w '%{http_code}' -X POST "$API$1" -H 'Content-Type: application/json' -d "$2"; }
login() { curl -s -X POST "$API/login" -H 'Content-Type: application/json' -d "{\"username\":\"$1\",\"password\":\"$2\"}"; }
user() { show "$(curl -s -o /dev/null -w '%{http_code}' "$API/user" ${1:+-H "Authorization: Bearer $1"})" "GET /user ${2:-}"; }
validate() { show "$(json /validate "{\"token\":\"$1\"}")" "POST /validate $2"; }
b64url() { printf '%s' "$1" | base64 | tr '+/' '-_' | tr -d '=\n'; }

show "$(curl -s -o /dev/null -w '%{http_code}' "$API/health")" "GET /health"

for u in demo:password admin:password123 testuser:password123 johndoe:password123 janedoe:password123; do
  name="${u%%:*}"
  body="$(login "$name" "${u##*:}")"
  token="$(jq -r .accessToken <<<"$body")"
  show 200 "POST /login $name"
  user "$token" "$name"
  validate "$token" "$name"
  if [ "$name" = demo ]; then DEMO_TOKEN="$token"; DEMO_REFRESH="$(jq -r .refreshToken <<<"$body")"; fi
done

user "$DEMO_TOKEN" "demo again"
show "$(json /login '{"username":"demo","password":"wrong"}')" "POST /login wrong password"
show "$(json /login '{"username":"disableduser","password":"password123"}')" "POST /login disabled user"
show "$(json /login '{"username":"demo"}')" "POST /login missing password"
user "" "no token"
user "not-a-jwt" "garbage token"

# Tokens a Base64 decoder has to reject or read exactly as before.
IFS=. read -r HEAD PAYLOAD SIG <<<"$DEMO_TOKEN"
validate "$HEAD.$PAYLOAD.${SIG%??}AA" "tampered signature"
validate "$HEAD.${PAYLOAD%???}.$SIG" "truncated payload"
validate "$HEAD.${PAYLOAD:0:10}*${PAYLOAD:11}.$SIG" "illegal character in payload"
validate "$HEAD.$PAYLOAD==.$SIG" "extra padding"
validate "$HEAD.$PAYLOAD" "missing signature"
validate "$(b64url '{"alg":"none"}').$PAYLOAD." "alg none"
validate "$HEAD.$(b64url '{"sub":"admin","iat":1700000000,"exp":4102444800}').$SIG" "swapped payload"
LONG_SUB="$(printf 'u%.0s' $(seq 1 600))"
LONG_PAYLOAD="$(printf '{"sub":"%s","exp":4102444800}' "$LONG_SUB")"
validate "$HEAD.$(b64url "$LONG_PAYLOAD").$SIG" "long forged payload"
user "$HEAD.$PAYLOAD.${SIG%??}AA" "tampered signature"

show "$(json /refresh "{\"refreshToken\":\"$DEMO_REFRESH\"}")" "POST /refresh"
show "$(json /refresh '{"refreshToken":"00000000-0000-0000-0000-000000000000"}')" "POST /refresh unknown token"
show "$(json /register '{"username":"grace","email":"grace@example.com","password":"password123"}')" "POST /register"
show "$(json /register '{"username":"demo","email":"demo2@example.com","password":"password123"}')" "POST /register duplicate"
