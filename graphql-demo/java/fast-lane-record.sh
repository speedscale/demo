#!/bin/bash
# Records the traffic the fast lane replays: starts the deployed image behind
# proxymock, runs one driver pass, then sends fast-lane-traffic.sh.
set -euo pipefail

IMAGE="${1:?usage: fast-lane-record.sh <image>}"
RECORDING="${RECORDING:-proxymock/recording}"
PROXYMOCK="${PROXYMOCK:-proxymock}"
APP_PORT="${APP_PORT:-8092}"

cleanup() {
  docker rm -f fast-lane-app >/dev/null 2>&1 || true
  [ -n "${RECORD_PID:-}" ] && kill -INT "$RECORD_PID" 2>/dev/null && wait "$RECORD_PID" 2>/dev/null || true
}
trap cleanup EXIT
cleanup

rm -rf "$RECORDING"
"$PROXYMOCK" record --app-port "$APP_PORT" --out "$RECORDING" >/dev/null 2>&1 &
RECORD_PID=$!
docker run -d --name fast-lane-app -p "$APP_PORT":8080 "$IMAGE" >/dev/null
until curl -sf "localhost:$APP_PORT/health" >/dev/null 2>&1 && nc -z localhost 4143 2>/dev/null; do sleep 1; done

docker run --rm "$IMAGE" -drive -target http://host.docker.internal:4143
./fast-lane-traffic.sh localhost:4143
sleep 2
cleanup
trap - EXIT

# The driver's own Session token expires after five minutes, so that one call cannot be replayed later.
grep -l '"Session"' "$RECORDING"/localhost/*.md | xargs grep -L 'fast-lane-' | xargs rm -f
