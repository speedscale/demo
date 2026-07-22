#!/usr/bin/env bash

set -euo pipefail

LOCAL_PORT=${LOCAL_PORT:-3000}
REMOTE_PORT=${REMOTE_PORT:-80}
READY_URL=${READY_URL:-http://127.0.0.1:${LOCAL_PORT}/healthz}
KUBECTL_BIN=${KUBECTL_BIN:-kubectl}
PORT_FORWARD_PID=""

usage() {
  echo "Usage: NAMESPACE=... SERVICE=... $0 -- <driver command>" >&2
}

cleanup() {
  local status=$?
  trap - EXIT
  if [[ -n $PORT_FORWARD_PID ]]; then
    kill "$PORT_FORWARD_PID" 2>/dev/null || true
    wait "$PORT_FORWARD_PID" 2>/dev/null || true
  fi
  exit "$status"
}

if [[ -z ${NAMESPACE:-} || -z ${SERVICE:-} ]]; then
  usage
  exit 2
fi
if [[ ${1:-} == "--" ]]; then
  shift
fi
if [[ $# -eq 0 ]]; then
  usage
  exit 2
fi

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

"$KUBECTL_BIN" port-forward \
  --namespace "$NAMESPACE" \
  "service/$SERVICE" \
  "${LOCAL_PORT}:${REMOTE_PORT}" >/dev/null 2>&1 &
PORT_FORWARD_PID=$!

for _ in $(seq 1 40); do
  if curl --fail --silent --max-time 1 "$READY_URL" >/dev/null; then
    "$@"
    exit
  fi
  if ! kill -0 "$PORT_FORWARD_PID" 2>/dev/null; then
    wait "$PORT_FORWARD_PID"
  fi
  sleep 0.25
done

echo "Port-forward did not become ready at ${READY_URL}" >&2
exit 1
