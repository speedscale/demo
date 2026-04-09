#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NODE_DIR="${ROOT_DIR}/node"
REC_DIR="${TMPDIR:-/tmp}/pm-node-rec"

echo "[1/5] Installing node demo dependencies"
npm install --prefix "${NODE_DIR}" >/dev/null

echo "[2/5] Recording traffic with proxymock"
rm -rf "${REC_DIR}"
proxymock record --timeout 20s --out "${REC_DIR}" --app-port 3000 -- npm start --prefix "${NODE_DIR}" >"${TMPDIR:-/tmp}/pm-node-record.log" 2>&1 &
PM_PID=$!

sleep 6
curl -sS "http://localhost:4143/healthz" >/dev/null
curl -sS "http://localhost:4143/" >/dev/null
wait "${PM_PID}"

echo "[3/5] Starting app for replay"
npm start --prefix "${NODE_DIR}" >"${TMPDIR:-/tmp}/pm-node-app.log" 2>&1 &
APP_PID=$!
sleep 3

echo "[4/5] Running replay gate checks"
set +e
proxymock replay \
  --in "${REC_DIR}" \
  --test-against http://localhost:3000 \
  --fail-if "requests.failed != 0" \
  --fail-if "latency.p95 > 5000" \
  --output pretty
STATUS=$?
set -e

echo "[5/5] Cleaning up"
kill "${APP_PID}" >/dev/null 2>&1 || true
wait "${APP_PID}" 2>/dev/null || true

if [[ ${STATUS} -ne 0 ]]; then
  echo "Replay gate failed"
  exit ${STATUS}
fi

echo "Replay gate passed"
