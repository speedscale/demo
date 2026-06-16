#!/usr/bin/env bash
#
# wiremock-export-demo
#
# Proves that traffic recorded by Speedscale can be exported to WireMock stub
# mappings and served by a real, unmodified WireMock server.
#
# Flow:
#   1. proxymock export wiremock  (recording -> mappings.json)
#   2. docker run wiremock/wiremock
#   3. POST /__admin/mappings/import  (load the stubs)
#   4. replay the recorded endpoints and assert WireMock matched our stubs
#   5. negative control: an unmapped path must 404
#
# Nothing here is mocked-out: step 2 is the genuine WireMock OSS image and the
# Matched-Stub-Id response header is WireMock telling us which exported stub it
# routed each request to.

set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PORT="${PORT:-8080}"
CONTAINER="${CONTAINER:-wiremock-export-demo}"
WIREMOCK_IMAGE="${WIREMOCK_IMAGE:-wiremock/wiremock:3.9.1}"
RECORDING="${RECORDING:-$HERE/proxymock/recording}"
MAPPINGS="${MAPPINGS:-$HERE/mappings.json}"
SERVICE="${SERVICE:-banking-gateway}"
BASE="http://localhost:${PORT}"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

bold() { printf '\033[1m%s\033[0m\n' "$*"; }

# ---------------------------------------------------------------------------
# 1. Export the recording to WireMock mappings.
#    The committed mappings.json lets the demo run even on a proxymock that
#    predates the exporter; if this proxymock has it, regenerate to prove it.
# ---------------------------------------------------------------------------
if command -v proxymock >/dev/null 2>&1 && proxymock export --help 2>/dev/null | grep -qw wiremock; then
  bold "==> Exporting recording -> WireMock mappings (proxymock export wiremock)"
  proxymock export wiremock \
    --in "$RECORDING" \
    --out "$MAPPINGS" \
    --inbound-only=false \
    --service "$SERVICE"
else
  bold "==> proxymock 'export wiremock' not found; using committed mappings.json"
  echo "    (install a proxymock build with 'export wiremock' to regenerate from the recording)"
fi

# ---------------------------------------------------------------------------
# 2. Start a real WireMock.
# ---------------------------------------------------------------------------
bold "==> Starting WireMock ($WIREMOCK_IMAGE) on :$PORT"
cleanup
docker run -d --name "$CONTAINER" -p "${PORT}:8080" "$WIREMOCK_IMAGE" >/dev/null
for _ in $(seq 1 30); do
  curl -sf "$BASE/__admin/mappings" >/dev/null 2>&1 && break
  sleep 1
done

# ---------------------------------------------------------------------------
# 3. Import the exported mappings via WireMock's admin API.
# ---------------------------------------------------------------------------
bold "==> Importing mappings into WireMock"
curl -s -X POST "$BASE/__admin/mappings/import" --data @"$MAPPINGS" \
  -o /dev/null -w "    import HTTP %{http_code}\n"
total=$(curl -s "$BASE/__admin/mappings" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['meta']['total'])")
echo "    loaded $total stub(s)"

# ---------------------------------------------------------------------------
# 4. Replay the recorded endpoints; assert 200 + a matched stub id.
# ---------------------------------------------------------------------------
bold "==> Replaying recorded endpoints against the mock"
hdr="$(mktemp)"; body="$(mktemp)"
trap 'rm -f "$hdr" "$body"; cleanup' EXIT

check() {
  local method="$1" path="$2"
  local code stub bytes
  code=$(curl -s -D "$hdr" -o "$body" -w "%{http_code}" \
    -X "$method" "$BASE$path" -H 'Content-Type: application/json' -d '{}')
  stub=$(awk -F': ' 'tolower($1)=="matched-stub-id"{gsub(/\r/,"",$2);print $2}' "$hdr")
  bytes=$(wc -c <"$body" | tr -d ' ')
  if [[ "$code" == "200" && -n "$stub" ]]; then
    printf '    OK   %-5s %-22s -> 200  matched stub %s  (%s-byte body)\n' \
      "$method" "$path" "${stub:0:8}" "$bytes"
  else
    printf '    FAIL %-5s %-22s -> %s  (matched-stub-id=%q)\n' \
      "$method" "$path" "$code" "$stub"
    exit 1
  fi
}

check GET  /api/accounts
check GET  /api/transactions
check GET  /api/users/profile
check POST /api/users/login

# ---------------------------------------------------------------------------
# 5. Negative control: a path that was never recorded must not match.
# ---------------------------------------------------------------------------
bold "==> Negative control"
nope=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/not-recorded")
echo "    GET /api/not-recorded -> $nope (expected 404)"
[[ "$nope" == "404" ]] || { echo "    FAIL: unexpected match"; exit 1; }

bold "==> PASS: Speedscale recording served by a real WireMock instance."
