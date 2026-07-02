#!/usr/bin/env bash
#
# Records the four-service checkout journey into ONE shared proxymock
# workspace so proxymock-web can draw a cross-service waterfall for a
# single customer — with NO trace IDs and NO code instrumentation.
#
# How it works (verified locally against proxymock v2.5.709):
#   * one `proxymock record` per service, each with its own in/out/health
#     ports, sharing one --out workspace. The waterfall's Service column
#     is uniform per record session, so N services == N sessions.
#   * each caller reaches the next service by a *.localtest.me hostname
#     (public DNS -> 127.0.0.1, so NO /etc/hosts and NO sudo) pointed at
#     that service's proxymock INBOUND port. Every hop is therefore
#     recorded on both sides: the caller's OUTBOUND (host=<svc>.localtest.me)
#     and the callee's INBOUND (host=localhost). Plain `localhost` targets
#     get bypassed by the proxy, which is why the DNS names matter.
#   * the propagated W3C `traceparent` lets the waterfall nest the hops.
#     It is NOT what you filter on — the customer's email is.
#
# Offline? Replace the *.localtest.me names below with /etc/hosts aliases:
#   echo '127.0.0.1 gateway.local auth.local orders.local shipping.local' | sudo tee -a /etc/hosts
#
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${OUT:-${DIR}/proxymock/user-journey}"
LOG="${TMPDIR:-/tmp}/uj-record"
COUNT="${COUNT:-40}"
mkdir -p "${LOG}"

echo "[1/4] Installing deps"
npm install --prefix "${DIR}" >/dev/null

echo "[2/4] Clearing stale recorders / ports"
pkill -f 'proxymock record' >/dev/null 2>&1 || true
pkill -f "${DIR}/server.js" >/dev/null 2>&1 || true
sleep 2
rm -rf "${OUT}"

PIDS=()
cleanup() {
  kill "${PIDS[@]}" >/dev/null 2>&1 || true
  pkill -f "${DIR}/server.js" >/dev/null 2>&1 || true
}
trap cleanup EXIT

#          svc      app  in    out   health  <extra env for downstreams...>
start_svc() {
  local svc=$1 app=$2 in=$3 out=$4 health=$5; shift 5
  proxymock record \
    --svc-name "${svc}" \
    --out "${OUT}" \
    --app-port "${app}" \
    --proxy-in-port "${in}" \
    --proxy-out-port "${out}" \
    --health-port "${health}" \
    --timeout 120s \
    -- env SERVICE="${svc}" PORT="${app}" "$@" node "${DIR}/server.js" \
    >"${LOG}/${svc}.log" 2>&1 &
  PIDS+=($!)
}

echo "[3/4] Starting recorders (one proxymock per service -> ${OUT})"
# Start leaf services first so downstream ports are live before callers.
start_svc shipping 3004 4443 4440 5804
start_svc auth     3002 4243 4240 5802
start_svc orders   3003 4343 4340 5803 SHIPPING_URL=http://shipping.localtest.me:4443
start_svc gateway  3001 4143 4140 5801 AUTH_URL=http://auth.localtest.me:4243 ORDERS_URL=http://orders.localtest.me:4343
sleep 11

echo "[4/4] Driving ${COUNT} customer checkouts through the edge (:4143)"
GATEWAY_URL=http://localhost:4143 COUNT="${COUNT}" node "${DIR}/loadgen.js"

# Let the recorders flush, then stop them.
sleep 2
cleanup
trap - EXIT
wait 2>/dev/null || true

echo
echo "Recorded to: ${OUT}"
echo "Services:    $(grep -rho 'k8sAppLabel=[a-z]*' "${OUT}" 2>/dev/null | sort -u | sed 's/k8sAppLabel=//' | paste -sd', ' -)"
echo
# proxymock web wants the workspace ROOT (the dir that contains proxymock/),
# not the recording dir itself.
echo "View it:     proxymock web --in ${OUT%/proxymock/*}"
echo
echo "Then in proxymock-web:"
echo "  1. Filters -> Full Text -> contains -> ada.lovelace@example.com -> Apply"
echo "  2. Switch the Requests view to the Trace lens"
echo "  3. Read that one customer's waterfall across gateway/auth/orders/shipping"
