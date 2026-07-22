#!/usr/bin/env bash

set -euo pipefail

SPEEDCTL_BIN=${SPEEDCTL_BIN:-speedctl}
TEST_CONFIG_ID=${TEST_CONFIG_ID:-external-driver}
MOCKS_READY_TIMEOUT=${MOCKS_READY_TIMEOUT:-10m}
POLL_INTERVAL=${POLL_INTERVAL:-5s}
REPORT_ID=""

usage() {
  echo "Usage: SNAPSHOT_ID=... CLUSTER=... NAMESPACE=... SERVICE=... $0 -- <driver command>" >&2
}

require_env() {
  local name=$1
  if [[ -z ${!name:-} ]]; then
    echo "Missing required environment variable: ${name}" >&2
    usage
    exit 2
  fi
}

cleanup() {
  local status=$?
  trap - EXIT
  if [[ -n $REPORT_ID ]]; then
    echo "Canceling Speedscale replay ${REPORT_ID}"
    "$SPEEDCTL_BIN" infra cancel-replay "$REPORT_ID" || \
      echo "Warning: unable to cancel replay ${REPORT_ID}" >&2
  fi
  exit "$status"
}

for name in SNAPSHOT_ID CLUSTER NAMESPACE SERVICE; do
  require_env "$name"
done

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

REPORT_ID=$(
  "$SPEEDCTL_BIN" infra replay \
    --snapshot-id "$SNAPSHOT_ID" \
    --cluster "$CLUSTER" \
    --namespace "$NAMESPACE" \
    --service "$SERVICE" \
    --test-config-id "$TEST_CONFIG_ID" \
    --id-only
)

if [[ -z $REPORT_ID ]]; then
  echo "speedctl did not return a replay ID" >&2
  exit 1
fi

echo "Waiting for Speedscale mocks for replay ${REPORT_ID}"
"$SPEEDCTL_BIN" wait replay "$REPORT_ID" \
  --for mocks-ready \
  --timeout "$MOCKS_READY_TIMEOUT" \
  --poll-interval "$POLL_INTERVAL"

echo "Mocks are ready. Starting test driver: $*"
"$@"
