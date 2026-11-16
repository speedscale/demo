#!/usr/bin/env bash
# Record: real partners + real Redis, app wrapped by proxymock, journeys driven through the inbound proxy.
source "$(dirname "$0")/common.sh"
OUT="${1:-proxymock/recording-$(date +%Y%m%d-%H%M%S)}"
build
stop_backends
start_backends
trap stop_backends EXIT

$PROXYMOCK record --app-port 8090 --out "$OUT" "${MAPS[@]}" -- dotnet "$API_DLL" >"$RUN_DIR/record.log" 2>&1 &
PM_PID=$!
wait_for http://localhost:4143/healthz
demo/drive.sh http://localhost:4143
sleep 2
kill -INT $PM_PID; wait $PM_PID || true
echo "recorded into $OUT"
find "$OUT" -type f -name '*.md' -o -type f -name '*.json' | sed "s|^$OUT/||; s|/[^/]*$||" | sort | uniq -c
