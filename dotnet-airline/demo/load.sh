#!/usr/bin/env bash
# Load: the same recorded journeys, 10 virtual users for 30s, partners and Redis mocked.
# Mocks answer instantly, so the numbers describe the Booking API itself, not its dependencies.
source "$(dirname "$0")/common.sh"
VUS="${VUS:-10}" FOR="${FOR:-30s}"
build
stop_backends
assert_backends_down
assert_ports_free
$PROXYMOCK mock --in proxymock/recording --out "proxymock/results/mock-load-$(run_tag)" "${MAPS[@]}" \
  -- dotnet "$API_DLL" >"$RUN_DIR/mock.log" 2>&1 &
PM_PID=$!
trap 'kill -INT $PM_PID 2>/dev/null; wait $PM_PID 2>/dev/null || true' EXIT
wait_for http://127.0.0.1:8090/healthz
$PROXYMOCK replay --in proxymock/recording --test-against http://127.0.0.1:8090 \
  --vus "$VUS" --for "$FOR" --load-test --exit-zero
