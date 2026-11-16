#!/usr/bin/env bash
# Mock + replay: partners and Redis are NOT running. proxymock serves them from the recording,
# then replays the recorded inbound journeys at the app and scores every response.
source "$(dirname "$0")/common.sh"
IN="${1:-proxymock/recording}"
TAG="${TAG:-$(run_tag)}"
shift || true
build
stop_backends
assert_backends_down
assert_ports_free

$PROXYMOCK mock --in "$IN" --no-passthrough --out "proxymock/results/mock-$TAG" "${MAPS[@]}" "$@" \
  -- dotnet "$API_DLL" >"$RUN_DIR/mock.log" 2>&1 &
PM_PID=$!
trap 'kill -INT $PM_PID 2>/dev/null; wait $PM_PID 2>/dev/null || true' EXIT
wait_for http://127.0.0.1:8090/healthz

set +e
$PROXYMOCK replay --in "$IN" --test-against http://127.0.0.1:8090 \
  --out "proxymock/results/replay-$TAG" --test-config regression
RC=$?
$PROXYMOCK replay score "proxymock/results/replay-$TAG" --mock-run "proxymock/results/mock-$TAG" --output pretty
exit $RC
