#!/bin/bash
# Fast lane check for an upgraded image. Replays the recording against it with
# MySQL mocked and answers four questions: did functionality break, did
# performance regress, are there new security findings, and is the build ready.
# With a deployed image as the second argument, performance and security are
# compared with a replay of that image taken in the same run.
set -euo pipefail

CANDIDATE="${1:?usage: fast-lane-check.sh <candidate image> [deployed image]}"
DEPLOYED="${2:-}"
RECORDING="${RECORDING:-proxymock/recording}"
PROXYMOCK="${PROXYMOCK:-proxymock}"
NAME=fast-lane-check
# Host port the app is reached on.
APP_PORT="${APP_PORT:-8091}"
# WARMUP passes run first and are not scored, so the JIT is warm when latency is measured.
# TIMES passes are scored.
WARMUP="${WARMUP:-20}"
TIMES="${TIMES:-20}"
# How far the candidate's p95 may sit above the deployed image's before the lane holds it.
PERF_BUDGET_PCT="${PERF_BUDGET_PCT:-50}"

RUN="${RUN:-proxymock/results/$(date +%s)}"
mkdir -p "$RUN"

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  [ -n "${MOCK_PID:-}" ] && kill "$MOCK_PID" 2>/dev/null || true
}
trap cleanup EXIT
cleanup

# Another server on the port would answer the replay in place of the image under test.
if nc -z localhost "$APP_PORT" 2>/dev/null; then
  echo "port $APP_PORT is already in use, set APP_PORT to a free one" >&2
  exit 2
fi

# Linux runners share the host network, so the app binds the port itself;
# Docker Desktop publishes it and reaches the host by name.
if [ "$(uname)" = "Linux" ]; then
  NET=(--network host -e SERVER_PORT="$APP_PORT")
  DB_HOST=localhost
else
  NET=(-p "$APP_PORT":8081)
  DB_HOST=host.docker.internal
fi

# replay_image <image> <output dir> <jvm options>: start the image against a
# fresh MySQL mock, warm it up, then replay the recording TIMES times.
replay_image() {
  local image="$1" out="$2" jvm="$3" status=0
  cleanup
  # Nothing listens behind the mapped port, so an unmatched query fails instead of reaching a database.
  # The mock can lose a race for one of its own listener ports, so a failed start is retried.
  for _ in 1 2 3; do
    "$PROXYMOCK" mock --in "$RECORDING" --no-passthrough --map 13306=mysql://localhost:3317 \
      --out "$out/mocked" >"$out/mock.log" 2>&1 &
    MOCK_PID=$!
    while kill -0 "$MOCK_PID" 2>/dev/null && ! nc -z localhost 13306 2>/dev/null; do sleep 1; done
    kill -0 "$MOCK_PID" 2>/dev/null && break
  done
  if ! kill -0 "$MOCK_PID" 2>/dev/null; then
    echo "MySQL mock did not start, see $out/mock.log" >&2
    exit 2
  fi

  docker run -d --name "$NAME" "${NET[@]}" \
    -e MYSQL_HOST="$DB_HOST" -e MYSQL_PORT=13306 \
    -e JWT_EXPIRATION=315360000000 \
    -e JAVA_TOOL_OPTIONS="$jvm" \
    "$image" >/dev/null
  for _ in $(seq 1 90); do
    curl -sf "localhost:$APP_PORT/api/auth/health" >/dev/null 2>&1 && break
    sleep 1
  done
  docker exec "$NAME" java -version 2>&1 | sed -n 2p >"$out/java-version.txt"

  if [ "$WARMUP" -gt 0 ]; then
    "$PROXYMOCK" replay --in "$RECORDING" --test-against "http://localhost:$APP_PORT" \
      --times "$WARMUP" --no-out >/dev/null 2>&1 || true
  fi
  "$PROXYMOCK" replay --in "$RECORDING" --test-against "http://localhost:$APP_PORT" \
    --test-config security-patch --times "$TIMES" --mocks-out "$out/mocked" --out "$out/replayed" \
    --output pretty >"$out/replay.log" 2>&1 || status=$?
  cleanup
  MOCK_PID=
  return "$status"
}

if [ -n "$DEPLOYED" ]; then
  mkdir -p "$RUN/deployed"
  replay_image "$DEPLOYED" "$RUN/deployed" "" || true
fi

# JAVA_TOOL_OPTIONS carries a JVM flag, such as a CVE mitigation, into the candidate only.
mkdir -p "$RUN/candidate"
READY=0
replay_image "$CANDIDATE" "$RUN/candidate" "${JAVA_TOOL_OPTIONS:-}" || READY=$?
VERDICT="$RUN/candidate/replayed/replay-verdict.json"

echo "candidate: $(cat "$RUN/candidate/java-version.txt")"
sed -n '/^READINESS/,/Readiness verdict/p' "$RUN/candidate/replay.log" | grep -vE '^ +n/a '

# Functionality and the readiness verdict come from the candidate's replay.
jq '{
  ready: (.goals.readiness.verdict == "ready"),
  assertions: .goals.assertions.total,
  failed: .goals.assertions.failed,
  letters: ([.goals.readiness.families[] | select(.role == "blocks") | "\(.family) \(.letter)"] | join(", ")),
  probe: ((.goals.readiness.families[] | select(.family == "Security") | .detail) | capture("(?<n>[0-9]+) endpoints? answered 2xx").n // "0" | tonumber)
}' "$VERDICT" >"$RUN/gate.json"

# Performance and new security findings come from comparing the candidate's
# replay with the deployed image's.
if [ -n "$DEPLOYED" ]; then
  "$PROXYMOCK" report --in "$RUN/candidate/replayed" --baseline "$RUN/deployed/replayed" \
    --format json --out "$RUN/compare.json" >/dev/null 2>&1
  "$PROXYMOCK" report --in "$RUN/candidate/replayed" --baseline "$RUN/deployed/replayed" \
    --format html --out "$RUN/compare.html" >/dev/null 2>&1 || true
  jq '{
    p95_deployed: (.deltas.stats[] | select(.label == "p95") | .b),
    p95_candidate: (.deltas.stats[] | select(.label == "p95") | .c),
    p95_pct: (.deltas.stats[] | select(.label == "p95") | .deltaPct),
    new_findings: ([.deltas.findings.new // [] | .[] | select(.confidence != "tentative")]),
    unchanged_findings: (.deltas.findings.persistent // [] | length),
    new_errors: (.deltas.errorClusters.new // [] | length)
  }' "$RUN/compare.json" >"$RUN/delta.json"
else
  echo '{}' >"$RUN/delta.json"
fi

jq -n --slurpfile g "$RUN/gate.json" --slurpfile d "$RUN/delta.json" --argjson budget "$PERF_BUDGET_PCT" '
  $g[0] as $g | $d[0] as $d
  | ($d.p95_pct != null) as $compared
  | {
      functionality: {pass: ($g.failed == 0 and (($d.new_errors // 0) == 0)),
        detail: "\($g.assertions - $g.failed) of \($g.assertions) assertions match the recording"},
      performance: (if $compared then {pass: ($d.p95_pct <= $budget),
        detail: "p95 \($d.p95_deployed) ms deployed, \($d.p95_candidate) ms candidate (\(if $d.p95_pct >= 0 then "+" else "" end)\($d.p95_pct)%, budget +\($budget)%)"}
        else {pass: null, detail: "not compared: no deployed image given"} end),
      security: {pass: ($g.probe == 0 and (($d.new_findings // []) | length) == 0),
        detail: ((if $compared then "\(($d.new_findings // []) | length) new findings, \($d.unchanged_findings) unchanged; " else "" end)
          + "auth probe: \($g.probe) endpoints answered without a credential"),
        new: [($d.new_findings // [])[] | "\(.severity): \(.title) (\(.endpoint))"]},
      gate: {pass: $g.ready, detail: $g.letters}
    }
  | .ship = ([.functionality.pass, .performance.pass, .security.pass, .gate.pass] | map(select(. != null)) | all)
' >"$RUN/summary.json"

jq -r '
  def mark: if . == null then "  -  " elif . then "PASS " else "FAIL " end;
  "",
  "Did functionality break?   \(.functionality.pass | mark) \(.functionality.detail)",
  "Did performance regress?   \(.performance.pass | mark) \(.performance.detail)",
  "Any new security issues?   \(.security.pass | mark) \(.security.detail)",
  (.security.new[] | "                                 new: \(.)"),
  "Readiness gate             \(.gate.pass | mark) \(.gate.detail)",
  "",
  (if .ship then "VERDICT: READY for production" else "VERDICT: NOT READY, hold the upgrade" end)
' "$RUN/summary.json"

jq -e '.ship' "$RUN/summary.json" >/dev/null
