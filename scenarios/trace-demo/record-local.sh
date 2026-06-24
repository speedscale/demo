#!/usr/bin/env bash
# Record the trace-demo stack locally with `proxymock record` (no Kubernetes).
#
# Starts the backend services, then records the gateway: proxymock's inbound
# proxy (:4143) captures the request into the gateway, and its outbound proxy
# (:4140) captures the gateway's fan-out to the backends. pricing's call to tax
# is captured too by routing pricing's outbound through the same :4140 proxy.
#
# Downstream URLs use $(hostname), NOT localhost: Go's HTTP client bypasses the
# proxy env vars for loopback hosts, so calls to localhost would never reach
# proxymock's outbound proxy and wouldn't be recorded.
#
# Run this in one terminal, then drive traffic in another:
#   ROLE=loadgen GATEWAY_URL=http://localhost:4143 COUNT=150 LOOP=false /tmp/trace-demo
# Then view what you captured:
#   proxymock web
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN=/tmp/trace-demo
HOST="$(hostname)"

echo "Building $BIN..."
( cd "$DIR/app" && go build -o "$BIN" . )

echo "Starting backends (cart, tax, payment, shipping, pricing)..."
ROLE=cart     PORT=8081 "$BIN" &
ROLE=tax      PORT=8085 "$BIN" &
ROLE=payment  PORT=8083 "$BIN" &
ROLE=shipping PORT=8084 "$BIN" &
# pricing -> tax: route pricing's outbound through proxymock's outbound proxy so
# the second-level hop is recorded as well.
http_proxy=http://localhost:4140 https_proxy=http://localhost:4140 \
  ROLE=pricing PORT=8082 TAX_URL="http://$HOST:8085" "$BIN" &
trap 'kill $(jobs -p) 2>/dev/null || true' EXIT
sleep 1

echo "Recording the gateway with proxymock (Ctrl-C to stop)..."
echo "Drive traffic from another terminal at http://localhost:4143"
proxymock record --app-port 8080 -- \
  env ROLE=gateway PORT=8080 \
      CART_URL="http://$HOST:8081" PRICING_URL="http://$HOST:8082" \
      PAYMENT_URL="http://$HOST:8083" SHIPPING_URL="http://$HOST:8084" \
      "$BIN"
