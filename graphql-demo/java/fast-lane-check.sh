#!/bin/bash
# Readiness check for a patched image: replay the recording against it and
# fail on any status or body mismatch.
set -euo pipefail

IMAGE="${1:?usage: fast-lane-check.sh <image>}"
RECORDING="${RECORDING:-proxymock/recording}"
PROXYMOCK="${PROXYMOCK:-proxymock}"
NAME=fast-lane-check
# Host port for the app on Docker Desktop; Linux runners use the host network on 8080.
APP_PORT="${APP_PORT:-8092}"
# Passes sent before the scored one, eight at a time, so the JIT compiles the
# Base64 decode path and the scored pass runs the native decoder. About 400 is enough.
WARMUP="${WARMUP:-0}"

cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT
cleanup

# Linux runners share the host network; Docker Desktop publishes the port.
if [ "$(uname)" = "Linux" ]; then
  NET=(--network host)
  APP_PORT=8080
else
  NET=(-p "$APP_PORT":8080)
fi

# JAVA_TOOL_OPTIONS carries a JVM flag such as the CVE mitigation into the candidate.
# PrintIntrinsics makes the JVM log when the JIT swaps in the native Base64 decoder.
docker run -d --name "$NAME" "${NET[@]}" \
  -e JAVA_TOOL_OPTIONS="-XX:+UnlockDiagnosticVMOptions -XX:+PrintIntrinsics ${JAVA_TOOL_OPTIONS:-}" \
  "$IMAGE" >/dev/null

for _ in $(seq 1 60); do
  curl -sf "localhost:$APP_PORT/health" >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$NAME" java -version 2>&1 | sed -n 2p
# CVE-2026-114938 is in the AVX-512 VBMI Base64 intrinsic, so only such CPUs run the patched code.
docker exec "$NAME" sh -c 'grep -qw avx512vbmi /proc/cpuinfo && echo "avx512vbmi: yes" || echo "avx512vbmi: no"'

RUN="proxymock/results/$(date +%s)"
mkdir -p "$RUN"
if [ "$WARMUP" -gt 0 ]; then
  "$PROXYMOCK" replay --in "$RECORDING" --test-against "http://localhost:$APP_PORT" \
    --test-config security-patch --vus 8 --times "$(((WARMUP + 7) / 8))" --out "$RUN/warmup" \
    --output pretty >"$RUN/warmup.log" 2>&1 || true
  # A dropped connection is counted apart from a response that differs.
  DROPPED="$( (grep -rl 'could not complete request' "$RUN/warmup" 2>/dev/null || true) | wc -l | tr -d ' ')"
  echo "warm-up:$(grep -m1 'assertions over' "$RUN/warmup.log"), $DROPPED requests dropped"
  rm -rf "$RUN/warmup"
fi
INTRINSIC="$(docker logs "$NAME" 2>&1 | grep -c 'Base64$Decoder::decodeBlock.*(intrinsic)' || true)"
[ "$INTRINSIC" -gt 0 ] && echo "native Base64 decoder in use: yes" || echo "native Base64 decoder in use: no"

# The security-patch test config compares every response field with the
# recording; any difference fails the replay.
STATUS=0
"$PROXYMOCK" replay --in "$RECORDING" --test-against "http://localhost:$APP_PORT" \
  --test-config security-patch --out "$RUN/replayed" \
  --output pretty "${@:2}" >"$RUN/replay.log" 2>&1 || STATUS=$?
sed -n '/TEST CONFIG GOALS/,/Goal verdict/p' "$RUN/replay.log"

exit "$STATUS"
