#!/bin/bash
# Readiness check for a patched image: replay the recording against it with
# every outbound dependency mocked, and fail on any status or body mismatch.
set -euo pipefail

IMAGE="${1:?usage: fast-lane-check.sh <image>}"
RECORDING="${RECORDING:-proxymock/recording}"
PROXYMOCK="${PROXYMOCK:-proxymock}"
CA_CERT="${CA_CERT:-$HOME/.speedscale/certs/tls.crt}"
NAME=fast-lane-check

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  [ -n "${MOCK_PID:-}" ] && kill "$MOCK_PID" 2>/dev/null || true
}
trap cleanup EXIT

RUN="proxymock/results/$(date +%s)"
"$PROXYMOCK" mock --in "$RECORDING" --no-passthrough --out "$RUN/mocked" >/dev/null 2>&1 &
MOCK_PID=$!

# Linux runners share the host network; Docker Desktop reaches the host by name.
if [ "$(uname)" = "Linux" ]; then
  NET=(--network host)
  PROXY=http://localhost:4140
else
  NET=(-p 5001:5001)
  PROXY=http://host.docker.internal:4140
fi

docker run -d --name "$NAME" "${NET[@]}" \
  -e HTTP_PROXY="$PROXY" \
  -e HTTPS_PROXY="$PROXY" \
  -e REQUESTS_CA_BUNDLE=/certs/tls.crt \
  -v "$CA_CERT":/certs/tls.crt:ro \
  "$IMAGE" >/dev/null

for _ in $(seq 1 30); do
  curl -sf localhost:5001/healthz >/dev/null 2>&1 && nc -z localhost 4140 2>/dev/null && break
  sleep 1
done

# The security-patch test config compares every response field and every
# outbound call with the recording; any difference fails the replay.
STATUS=0
"$PROXYMOCK" replay --in "$RECORDING" --test-against http://localhost:5001 \
  --test-config security-patch --mocks-out "$RUN/mocked" --out "$RUN/replayed" \
  --output pretty "${@:2}" >"$RUN/replay.log" 2>&1 || STATUS=$?
sed -n '/TEST CONFIG GOALS/,/Goal verdict/p' "$RUN/replay.log"

# Report only: show each response whose body changed, using proxymock's
# file compare (header-only differences such as Date are skipped).
"$PROXYMOCK" files compare --exit-zero -vv \
  --in "$RECORDING/localhost" --in "$RUN/replayed/localhost" 2>&1 |
  awk '/^✘/{if (blk ~ /# response body/) printf "%s", blk; blk=""} {blk = blk $0 "\n"}
       END{if (blk ~ /# response body/) printf "%s", blk}' |
  awk '/^# response headers/{skip=1} /^━|^✘/{skip=0} !skip'

exit "$STATUS"
