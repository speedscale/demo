#!/usr/bin/env bash

set -euo pipefail

SCENARIO_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
POSTMAN_BIN=${POSTMAN_BIN:-postman}
FIXTURE_PORT=${FIXTURE_PORT:-18080}
BASE_URL="http://127.0.0.1:${FIXTURE_PORT}"

with_fixture_port_forward() {
  KUBECTL_BIN="$SCENARIO_DIR/test/fixture-port-forward.sh" \
    FIXTURE_SERVER="$SCENARIO_DIR/test/fixture-server.mjs" \
    NAMESPACE=fixture \
    SERVICE=fixture \
    LOCAL_PORT="$FIXTURE_PORT" \
    "$SCENARIO_DIR/drivers/run-with-port-forward.sh" -- "$@"
}

with_fixture_port_forward \
  k6 run --env BASE_URL="$BASE_URL" "$SCENARIO_DIR/drivers/k6/replay.js"

COLLECTION="$SCENARIO_DIR/postman/collections/replay-sandwich"
"$POSTMAN_BIN" collection lint "$COLLECTION" --fail-severity warning
with_fixture_port_forward \
  "$POSTMAN_BIN" collection run "$COLLECTION" \
    --env-var "baseUrl=$BASE_URL" \
    --bail \
    --timeout 120000

echo "PASS: k6 and Postman Collection v3 exercise the same API contract through the port-forward helper"
