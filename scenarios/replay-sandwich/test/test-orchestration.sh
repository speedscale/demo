#!/usr/bin/env bash

set -euo pipefail

SCENARIO_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
TEST_TMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEST_TMP_DIR"' EXIT

FAKE_SPEEDCTL="$TEST_TMP_DIR/speedctl"
DRIVER="$TEST_TMP_DIR/driver"
LOG_FILE="$TEST_TMP_DIR/calls.log"

cat >"$FAKE_SPEEDCTL" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "$*" >>"$CALLS_LOG"
case "$1 $2" in
  "infra replay") echo "report-123" ;;
  "wait replay") exit "${WAIT_EXIT_CODE:-0}" ;;
  "infra cancel-replay") exit 0 ;;
esac
EOF

cat >"$DRIVER" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
echo "driver" >>"$CALLS_LOG"
exit "${DRIVER_EXIT_CODE:-0}"
EOF

chmod +x "$FAKE_SPEEDCTL" "$DRIVER"

run_sandwich() {
  CALLS_LOG="$LOG_FILE" \
  SPEEDCTL_BIN="$FAKE_SPEEDCTL" \
  SNAPSHOT_ID="snapshot-123" \
  CLUSTER="demo" \
  NAMESPACE="replay-sandwich" \
  SERVICE="node-server" \
  "$SCENARIO_DIR/run-replay-sandwich.sh" -- "$DRIVER"
}

assert_line_order() {
  local first=$1
  local second=$2
  local first_line second_line
  first_line=$(grep -n "$first" "$LOG_FILE" | head -1 | cut -d: -f1)
  second_line=$(grep -n "$second" "$LOG_FILE" | head -1 | cut -d: -f1)
  [[ $first_line -lt $second_line ]]
}

: >"$LOG_FILE"
run_sandwich
assert_line_order "wait replay report-123" "^driver$"
assert_line_order "^driver$" "infra cancel-replay report-123"

: >"$LOG_FILE"
set +e
WAIT_EXIT_CODE=41 run_sandwich
status=$?
set -e
[[ $status -eq 41 ]]
! grep -q '^driver$' "$LOG_FILE"
grep -q '^infra cancel-replay report-123$' "$LOG_FILE"

: >"$LOG_FILE"
set +e
DRIVER_EXIT_CODE=42 run_sandwich
status=$?
set -e
[[ $status -eq 42 ]]
grep -q '^infra cancel-replay report-123$' "$LOG_FILE"

echo "PASS: replay lifecycle gates the driver and always cancels the replay"
