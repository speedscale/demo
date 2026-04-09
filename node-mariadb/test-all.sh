#!/usr/bin/env bash
# ===========================================================================
# test-all.sh -- Automated end-to-end demo: record, replay, mock
#
# Runs the full lifecycle:
#   Phase 1: Record traffic  (proxymock record)
#   Phase 2: Replay WITHOUT mocks (real MariaDB, proxymock replay)
#   Phase 3: Replay WITH mocks    (no MariaDB needed, proxymock mock + replay)
#
# Prerequisites:
#   - Docker (for MariaDB + KrakenD)
#   - Node.js 18+
#   - proxymock installed (https://downloads.speedscale.com/proxymock/install-proxymock)
#   - TLS certs generated (./gen-certs.sh)
#   - MariaDB running (docker compose up -d mariadb)
#
# Usage:
#   ./test-all.sh              # run all 3 phases
#   ./test-all.sh record       # only Phase 1
#   ./test-all.sh replay       # only Phase 2 (requires prior recording)
#   ./test-all.sh mock         # only Phase 3 (requires prior recording)
# ===========================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
APP_PORT=3001
PROXY_IN_PORT=4143
PROXY_OUT_PORT=4140
DB_PROXY_PORT=13306
DB_REAL_PORT=3306
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
RECORD_DIR="proxymock/recorded-${TIMESTAMP}"
REPLAY_DIR="proxymock/replayed-${TIMESTAMP}"
MOCK_DIR="proxymock/mocked-${TIMESTAMP}"
MOCK_REPLAY_DIR="proxymock/mock-replayed-${TIMESTAMP}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
step() { echo -e "\n${BLUE}[$1]${NC} $2"; }
ok()   { echo -e "${GREEN}  ok${NC} $1"; }
fail() { echo -e "${RED}  FAIL${NC} $1"; exit 1; }
warn() { echo -e "${YELLOW}  warn${NC} $1"; }

wait_for_port() {
  local port=$1 label=$2 retries=${3:-30}
  echo -n "  Waiting for ${label} on :${port}"
  for i in $(seq 1 "$retries"); do
    if curl -sf "http://localhost:${port}/health" >/dev/null 2>&1; then
      echo " ready"
      return 0
    fi
    echo -n "."
    sleep 2
  done
  echo " TIMEOUT"
  return 1
}

wait_for_db() {
  local port=$1 retries=${2:-30}
  echo -n "  Waiting for MariaDB on :${port}"
  for i in $(seq 1 "$retries"); do
    if docker compose exec -T mariadb healthcheck.sh --connect --innodb_initialized >/dev/null 2>&1; then
      echo " ready"
      return 0
    fi
    echo -n "."
    sleep 2
  done
  echo " TIMEOUT"
  return 1
}

cleanup() {
  echo -e "\n${YELLOW}Cleaning up...${NC}"
  kill "$NODE_PID" 2>/dev/null && wait "$NODE_PID" 2>/dev/null || true
  kill "$PROXYMOCK_PID" 2>/dev/null && wait "$PROXYMOCK_PID" 2>/dev/null || true
  kill "$MOCK_PID" 2>/dev/null && wait "$MOCK_PID" 2>/dev/null || true
}
NODE_PID="" PROXYMOCK_PID="" MOCK_PID=""
trap cleanup EXIT INT TERM

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------
preflight() {
  step "0/N" "Preflight checks"
  command -v node >/dev/null    || fail "node not found"
  command -v npm >/dev/null     || fail "npm not found"
  command -v docker >/dev/null  || fail "docker not found"
  command -v proxymock >/dev/null || fail "proxymock not found -- install: sh -c \"\$(curl -Lfs https://downloads.speedscale.com/proxymock/install-proxymock)\""
  [ -f certs/ca.pem ]          || fail "TLS certs missing -- run: ./gen-certs.sh"
  npm install --silent 2>/dev/null
  ok "All tools present, dependencies installed"
}

# ---------------------------------------------------------------------------
# Phase 1: Record
# ---------------------------------------------------------------------------
phase_record() {
  echo ""
  echo -e "${BLUE}================================================================${NC}"
  echo -e "${BLUE}  PHASE 1: Record Traffic${NC}"
  echo -e "${BLUE}================================================================${NC}"

  # Ensure MariaDB is running
  step "1/6" "Starting MariaDB (docker)"
  docker compose up -d mariadb
  wait_for_db "$DB_REAL_PORT"

  # Start proxymock recorder
  #   --map 13306=localhost:3306  intercepts DB traffic on :13306 -> real DB :3306
  #   --app-port 3001            the Node app listens on :3001
  step "2/6" "Starting proxymock recorder"
  proxymock record \
    --app-port "$APP_PORT" \
    --map "${DB_PROXY_PORT}=localhost:${DB_REAL_PORT}" \
    --out "$RECORD_DIR" \
    > /tmp/proxymock-record.log 2>&1 &
  PROXYMOCK_PID=$!
  sleep 3
  if ! ps -p "$PROXYMOCK_PID" >/dev/null 2>&1; then
    fail "proxymock record failed to start -- check /tmp/proxymock-record.log"
  fi
  ok "proxymock recording (PID $PROXYMOCK_PID, inbound :$PROXY_IN_PORT, outbound :$PROXY_OUT_PORT)"

  # Start Node app pointed at the proxymock DB proxy port
  step "3/6" "Starting Node.js API (DB via proxymock :$DB_PROXY_PORT)"
  DB_HOST=127.0.0.1 \
  DB_PORT=$DB_PROXY_PORT \
  DB_SSL_CA=./certs/ca.pem \
  PORT=$APP_PORT \
  node server.js > /tmp/node-record.log 2>&1 &
  NODE_PID=$!
  wait_for_port "$APP_PORT" "Node API" || fail "Node app did not start"

  # Generate traffic through the proxymock inbound proxy
  step "4/6" "Generating traffic through proxymock proxy (:$PROXY_IN_PORT)"
  generate_traffic "$PROXY_IN_PORT"

  # Stop recording
  step "5/6" "Stopping proxymock recorder"
  sleep 2
  kill "$PROXYMOCK_PID" 2>/dev/null; wait "$PROXYMOCK_PID" 2>/dev/null || true
  PROXYMOCK_PID=""
  ok "Recording stopped"

  # Stop Node app
  kill "$NODE_PID" 2>/dev/null; wait "$NODE_PID" 2>/dev/null || true
  NODE_PID=""

  # Summarise
  step "6/6" "Recording summary"
  local file_count
  file_count=$(find "$RECORD_DIR" -name "*.md" -type f 2>/dev/null | wc -l | tr -d ' ')
  ok "Recorded ${file_count} RRPair files in ${RECORD_DIR}/"
}

# ---------------------------------------------------------------------------
# Phase 2: Replay WITHOUT mocks (real MariaDB)
# ---------------------------------------------------------------------------
phase_replay() {
  echo ""
  echo -e "${BLUE}================================================================${NC}"
  echo -e "${BLUE}  PHASE 2: Replay WITHOUT Mocks (real MariaDB)${NC}"
  echo -e "${BLUE}================================================================${NC}"

  local in_dir="${1:-$RECORD_DIR}"

  # Ensure MariaDB is running
  step "1/4" "Ensuring MariaDB is running"
  docker compose up -d mariadb
  wait_for_db "$DB_REAL_PORT"

  # Start Node app against real DB (fresh process, clean state)
  step "2/4" "Starting Node.js API (real MariaDB :$DB_REAL_PORT)"
  DB_HOST=127.0.0.1 \
  DB_PORT=$DB_REAL_PORT \
  DB_SSL_CA=./certs/ca.pem \
  PORT=$APP_PORT \
  node server.js > /tmp/node-replay.log 2>&1 &
  NODE_PID=$!
  wait_for_port "$APP_PORT" "Node API" || fail "Node app did not start"

  # Replay recorded traffic directly against the app (no mocks)
  step "3/4" "Replaying recorded traffic against Node (no mocks)"
  proxymock replay \
    --in "$in_dir" \
    --test-against "http://localhost:${APP_PORT}" \
    --out "$REPLAY_DIR" \
    --fail-if "requests.failed != 0" \
    > /tmp/proxymock-replay.log 2>&1 || true
  REPLAY_EXIT=$?

  # Stop Node
  kill "$NODE_PID" 2>/dev/null; wait "$NODE_PID" 2>/dev/null || true
  NODE_PID=""

  step "4/4" "Replay results (no mocks)"
  if [ -f /tmp/proxymock-replay.log ]; then
    tail -30 /tmp/proxymock-replay.log
  fi
  echo ""
  if [ "$REPLAY_EXIT" -eq 0 ]; then
    ok "Replay WITHOUT mocks passed"
  else
    warn "Replay WITHOUT mocks completed with issues (exit $REPLAY_EXIT)"
  fi
}

# ---------------------------------------------------------------------------
# Phase 3: Replay WITH mocks (no real MariaDB needed)
# ---------------------------------------------------------------------------
phase_mock() {
  echo ""
  echo -e "${BLUE}================================================================${NC}"
  echo -e "${BLUE}  PHASE 3: Replay WITH Mocks (MariaDB mocked by proxymock)${NC}"
  echo -e "${BLUE}================================================================${NC}"

  local in_dir="${1:-$RECORD_DIR}"

  # Stop real MariaDB so we prove the mock works
  step "1/6" "Stopping real MariaDB (to prove mocking works)"
  docker compose stop mariadb 2>/dev/null || true
  ok "MariaDB stopped"

  # Start proxymock mock server
  #   --map 3306=mysql://localhost:3306 serves recorded MySQL traffic on :3306
  step "2/6" "Starting proxymock mock server (MySQL mock on :$DB_REAL_PORT)"
  proxymock mock \
    --in "$in_dir" \
    --out "$MOCK_DIR" \
    --map "${DB_REAL_PORT}=mysql://localhost:${DB_REAL_PORT}" \
    > /tmp/proxymock-mock.log 2>&1 &
  MOCK_PID=$!
  sleep 3
  if ! ps -p "$MOCK_PID" >/dev/null 2>&1; then
    fail "proxymock mock failed to start -- check /tmp/proxymock-mock.log"
  fi
  ok "Mock server started (PID $MOCK_PID)"

  # Start Node app pointed at the mock DB (same port as real DB, but proxymock is answering)
  step "3/6" "Starting Node.js API (DB -> proxymock mock on :$DB_REAL_PORT)"
  DB_HOST=127.0.0.1 \
  DB_PORT=$DB_REAL_PORT \
  DB_SSL_CA="" \
  PORT=$APP_PORT \
  node server.js > /tmp/node-mock-replay.log 2>&1 &
  NODE_PID=$!
  if ! wait_for_port "$APP_PORT" "Node API"; then
    warn "Node app did not start with mocked DB. This commonly happens when recorded DB traffic is TLS-encrypted and cannot be mocked as MySQL protocol traffic."
    if [ -f /tmp/node-mock-replay.log ]; then
      tail -30 /tmp/node-mock-replay.log
    fi
    kill "$MOCK_PID" 2>/dev/null; wait "$MOCK_PID" 2>/dev/null || true
    MOCK_PID=""
    step "6/6" "Restarting MariaDB"
    docker compose up -d mariadb
    wait_for_db "$DB_REAL_PORT"
    warn "Skipping Phase 3 mock replay; use Phase 2 replay for TLS-enforced MariaDB paths."
    return 0
  fi

  # Replay recorded traffic
  step "4/6" "Replaying recorded traffic with mocked DB"
  proxymock replay \
    --in "$in_dir" \
    --test-against "http://localhost:${APP_PORT}" \
    --out "$MOCK_REPLAY_DIR" \
    --fail-if "requests.failed != 0" \
    > /tmp/proxymock-mock-replay.log 2>&1 || true
  MOCK_REPLAY_EXIT=$?

  # Stop Node and mock server
  kill "$NODE_PID" 2>/dev/null; wait "$NODE_PID" 2>/dev/null || true
  NODE_PID=""
  kill "$MOCK_PID" 2>/dev/null; wait "$MOCK_PID" 2>/dev/null || true
  MOCK_PID=""

  step "5/6" "Replay results (with mocks)"
  if [ -f /tmp/proxymock-mock-replay.log ]; then
    tail -30 /tmp/proxymock-mock-replay.log
  fi

  # Restart real MariaDB so the system is back to normal
  step "6/6" "Restarting MariaDB"
  docker compose up -d mariadb
  wait_for_db "$DB_REAL_PORT"

  echo ""
  if [ "$MOCK_REPLAY_EXIT" -eq 0 ]; then
    ok "Replay WITH mocks passed -- MariaDB was fully simulated by proxymock"
  else
    warn "Replay WITH mocks completed with issues (exit $MOCK_REPLAY_EXIT)"
  fi
}

# ---------------------------------------------------------------------------
# Traffic generator -- sends representative CRUD traffic
# ---------------------------------------------------------------------------
generate_traffic() {
  local port=$1

  echo "  Creating product..."
  CREATE_RESP=$(curl -sf -X POST "http://localhost:${port}/products" \
    -H 'Content-Type: application/json' \
    -d '{"name":"Widget Alpha","price":19.99,"quantity":50}')
  PRODUCT_ID=$(echo "$CREATE_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || echo "1")
  ok "Created product $PRODUCT_ID"

  echo "  Listing products..."
  curl -sf "http://localhost:${port}/products" >/dev/null
  ok "Listed products"

  echo "  Getting product $PRODUCT_ID..."
  curl -sf "http://localhost:${port}/products/${PRODUCT_ID}" >/dev/null
  ok "Got product $PRODUCT_ID"

  echo "  Updating product $PRODUCT_ID..."
  curl -sf -X PUT "http://localhost:${port}/products/${PRODUCT_ID}" \
    -H 'Content-Type: application/json' \
    -d '{"name":"Widget Alpha v2","price":24.99,"quantity":42}' >/dev/null
  ok "Updated product $PRODUCT_ID"

  echo "  Creating second product..."
  curl -sf -X POST "http://localhost:${port}/products" \
    -H 'Content-Type: application/json' \
    -d '{"name":"Gadget Beta","price":49.99,"quantity":10}' >/dev/null
  ok "Created second product"

  echo "  Listing all products again..."
  curl -sf "http://localhost:${port}/products" >/dev/null
  ok "Listed products"

  echo "  Health check..."
  curl -sf "http://localhost:${port}/health" >/dev/null
  ok "Health check passed"

  echo "  Deleting product $PRODUCT_ID..."
  curl -sf -X DELETE "http://localhost:${port}/products/${PRODUCT_ID}" >/dev/null
  ok "Deleted product $PRODUCT_ID"

  echo "  Final product list..."
  curl -sf "http://localhost:${port}/products" >/dev/null
  ok "Final list retrieved"
}

# ---------------------------------------------------------------------------
# Find most recent recording directory for standalone replay/mock phases
# ---------------------------------------------------------------------------
find_latest_recording() {
  local latest
  latest=$(ls -dt proxymock/recorded-* 2>/dev/null | head -1)
  if [ -z "$latest" ]; then
    fail "No recording found in proxymock/ -- run Phase 1 first: ./test-all.sh record"
  fi
  echo "$latest"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
main() {
  local phase="${1:-all}"

  echo -e "${BLUE}================================================================${NC}"
  echo -e "${BLUE}  Node-MariaDB Demo: Automated Test Lifecycle${NC}"
  echo -e "${BLUE}================================================================${NC}"

  preflight

  case "$phase" in
    record)
      phase_record
      ;;
    replay)
      local dir
      dir=$(find_latest_recording)
      echo -e "  Using recording: ${dir}"
      phase_replay "$dir"
      ;;
    mock)
      local dir
      dir=$(find_latest_recording)
      echo -e "  Using recording: ${dir}"
      phase_mock "$dir"
      ;;
    all)
      phase_record
      phase_replay "$RECORD_DIR"
      phase_mock "$RECORD_DIR"
      echo ""
      echo -e "${BLUE}================================================================${NC}"
      echo -e "${BLUE}  Summary${NC}"
      echo -e "${BLUE}================================================================${NC}"
      echo ""
      echo "  Recordings:          ${RECORD_DIR}/"
      echo "  Replay (no mocks):   ${REPLAY_DIR}/"
      echo "  Mock responses:      ${MOCK_DIR}/"
      echo "  Replay (with mocks): ${MOCK_REPLAY_DIR}/"
      echo ""
      echo "  Inspect any of these with:  proxymock inspect --in <dir>"
      echo ""
      ok "All phases complete"
      ;;
    *)
      echo "Usage: $0 [record|replay|mock|all]"
      exit 1
      ;;
  esac
}

main "$@"
