#!/usr/bin/env bash
# Record: real partners + real Redis, app wrapped by proxymock, journeys driven through the inbound proxy.
source "$(dirname "$0")/common.sh"
OUT="${1:-proxymock/recording-$(date +%Y%m%d-%H%M%S)}"
if [ -e "$OUT" ]; then echo "$OUT already exists; choose a new directory" >&2; exit 1; fi
build
stop_backends
assert_ports_free
assert_backends_down
trap stop_backends EXIT
start_backends

$PROXYMOCK record --app-port 8090 --out "$OUT" "${MAPS[@]}" -- dotnet "$API_DLL" >"$RUN_DIR/record.log" 2>&1 &
PM_PID=$!
cleanup() {
  kill -INT "$PM_PID" 2>/dev/null && wait "$PM_PID" 2>/dev/null || true
  stop_backends
}
trap cleanup EXIT
wait_for http://localhost:4143/healthz
demo/drive.sh http://localhost:4143
sleep 2
cleanup
trap - EXIT
echo "recorded into $OUT"
find "$OUT" -type f -name '*.md' -o -type f -name '*.json' | sed "s|^$OUT/||; s|/[^/]*$||" | sort | uniq -c
