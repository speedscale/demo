#!/usr/bin/env bash
# Replays the dotnet-airline recording against the booking API with its dependencies mocked, then runs
# an ephyra property test against the same mocks, on the API as it is and with patches/checkout-decline.patch.
# Needs the .NET 8 SDK, Docker (for Redis), cargo and proxymock. Everything runs locally on free ports.
#
# Environment overrides: EPHYRA_SEED (default 1), EPHYRA_TESTS (default 200), STARTUP_TIMEOUT seconds
# (default 90), STEP_TIMEOUT seconds (default 600), PROXYMOCK, REDIS_IMAGE.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
AIRLINE="$HERE/../dotnet-airline"
RECORDING="$AIRLINE/proxymock/recording"
PARTNERS="$HERE/proxymock/recorded-partners"
REGRESSIONS="$HERE/proxymock/regressions-ephyra"
CHANGE="$HERE/patches/checkout-decline.patch"
BUILD="$HERE/.build"
LOG_DIR="$HERE/logs"
RESULTS="$HERE/proxymock/results"
REDIS_IMAGE="${REDIS_IMAGE:-redis:7-alpine}"
REDIS_CONTAINER="ephyra-airline-redis-$$"
STARTUP_TIMEOUT="${STARTUP_TIMEOUT:-90}"
STEP_TIMEOUT="${STEP_TIMEOUT:-600}"
export EPHYRA_SEED="${EPHYRA_SEED:-1}" EPHYRA_TESTS="${EPHYRA_TESTS:-200}"
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1 DOTNET_SKIP_FIRST_TIME_EXPERIENCE=1
if [ -x "$HOME/.dotnet/dotnet" ] && ! command -v dotnet >/dev/null 2>&1; then export DOTNET_ROOT="$HOME/.dotnet" PATH="$HOME/.dotnet:$PATH"; fi

say() { printf '%s\n' "$*"; }
step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
die() { printf 'error: %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------------- preflight

PROXYMOCK="${PROXYMOCK:-}"
if [ -z "$PROXYMOCK" ]; then
  if [ -x "$HOME/.speedscale/proxymock" ]; then PROXYMOCK="$HOME/.speedscale/proxymock"; else PROXYMOCK="$(command -v proxymock || true)"; fi
fi

missing=()
command -v dotnet >/dev/null 2>&1 && dotnet --list-sdks 2>/dev/null | grep -q '^8\.' \
  || missing+=("the .NET 8 SDK (https://dotnet.microsoft.com/download/dotnet/8.0)")
command -v docker >/dev/null 2>&1 || missing+=("docker (https://docs.docker.com/get-docker/)")
command -v cargo >/dev/null 2>&1 || missing+=("cargo, from Rust (https://rustup.rs)")
[ -n "$PROXYMOCK" ] && [ -x "$PROXYMOCK" ] \
  || missing+=("proxymock (https://docs.speedscale.com/proxymock/getting-started/installation/)")
for tool in curl patch; do command -v "$tool" >/dev/null 2>&1 || missing+=("$tool"); done
if [ ${#missing[@]} -gt 0 ]; then
  printf 'Missing prerequisites:\n' >&2
  printf '  - %s\n' "${missing[@]}" >&2
  exit 1
fi
docker info >/dev/null 2>&1 || die "Docker is installed but its daemon is not reachable; start Docker and run this again"
[ -d "$RECORDING/localhost" ] || die "no recording at $RECORDING"

mkdir -p "$LOG_DIR" "$RESULTS"
rm -rf "$RESULTS"/* "$LOG_DIR"/*
cd "$HERE" || exit 1

# ---------------------------------------------------------------- processes and cleanup

APP_PID=""
MOCK_PID=""
stop_app() { if [ -n "$APP_PID" ]; then kill "$APP_PID" 2>/dev/null; wait "$APP_PID" 2>/dev/null; APP_PID=""; fi; }
stop_mock() { if [ -n "$MOCK_PID" ]; then kill -INT "$MOCK_PID" 2>/dev/null; wait "$MOCK_PID" 2>/dev/null; MOCK_PID=""; fi; }
cleanup() {
  stop_app
  stop_mock
  docker rm -f "$REDIS_CONTAINER" >/dev/null 2>&1
}
trap cleanup EXIT
trap 'echo; echo "interrupted" >&2; exit 130' INT TERM

port_in_use() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

# free_port <var>: sets <var> to a free local port that no earlier call returned.
# Runs in the current shell so TAKEN persists between calls.
TAKEN=" "
free_port() {
  local p
  for _ in $(seq 200); do
    p=$((20000 + RANDOM % 40000))
    case "$TAKEN" in *" $p "*) continue ;; esac
    port_in_use "$p" && continue
    TAKEN="$TAKEN$p "
    printf -v "$1" '%s' "$p"
    return 0
  done
  die "could not find a free local port"
}

# wait_for <what> <seconds> <command...>: retries the command once a second until it succeeds.
wait_for() {
  local what="$1" limit="$2" start=$SECONDS
  shift 2
  until "$@" >/dev/null 2>&1; do
    [ $((SECONDS - start)) -ge "$limit" ] && { echo "timed out after ${limit}s waiting for $what" >&2; return 1; }
    sleep 1
  done
}

# with_timeout <seconds> <command...>: runs the command, stopping it if it runs longer.
with_timeout() {
  local limit="$1"
  shift
  "$@" &
  local pid=$!
  ( sleep "$limit" && kill "$pid" 2>/dev/null && echo "stopped after ${limit}s" >&2 ) &
  local watchdog=$!
  wait "$pid"
  local rc=$?
  kill "$watchdog" 2>/dev/null
  wait "$watchdog" 2>/dev/null
  return "$rc"
}

free_port API_PORT
free_port SCHEDULE_PORT
free_port PRICING_PORT
free_port PAYMENTS_PORT
free_port REDIS_MOCK_PORT
free_port REDIS_PORT
free_port PROXY_PORT

# build <name> [patch]: builds the booking API from dotnet-airline into .build/<name>, with the patch applied.
# A build whose sources and patch are unchanged is reused, so later runs need no network.
build() {
  local name="$1" patchfile="${2:-}" src="$BUILD/$1-src" stamp
  stamp="$( (cat "$AIRLINE"/src/BookingApi/*.cs "$AIRLINE"/src/BookingApi/*.csproj "$AIRLINE/global.json"; [ -n "$patchfile" ] && cat "$patchfile") | cksum)"
  if [ -f "$BUILD/$name/BookingApi.dll" ] && [ "$(cat "$BUILD/$name.stamp" 2>/dev/null)" = "$stamp" ]; then
    say "$name: up to date"
    return 0
  fi
  rm -rf "$src" "$BUILD/$name" && mkdir -p "$src/src"
  cp "$AIRLINE/global.json" "$src/"
  cp -R "$AIRLINE/src/BookingApi" "$src/src/"
  rm -rf "$src/src/BookingApi/bin" "$src/src/BookingApi/obj"
  if [ -n "$patchfile" ]; then patch -s -p1 -d "$src" <"$patchfile" || die "could not apply $patchfile"; fi
  with_timeout "$STEP_TIMEOUT" dotnet build "$src/src/BookingApi/BookingApi.csproj" -c Release -v quiet -nologo -o "$BUILD/$name" \
    >"$LOG_DIR/build-$name.log" 2>&1 || { tail -20 "$LOG_DIR/build-$name.log" >&2; die "build of $name failed (log: logs/build-$name.log)"; }
  echo "$stamp" >"$BUILD/$name.stamp"
  say "$name: built"
}

healthy() { curl -sf -m 2 -o /dev/null "http://127.0.0.1:$API_PORT/healthz"; }

# start_app <build> <redis port>: the API reaches its partners and Redis on local ports.
start_app() {
  stop_app
  SCHEDULE_URL="http://127.0.0.1:$SCHEDULE_PORT" PRICING_URL="http://127.0.0.1:$PRICING_PORT" \
    PAYMENTS_URL="http://127.0.0.1:$PAYMENTS_PORT" REDIS_ADDR="127.0.0.1:$2" PORT="$API_PORT" \
    dotnet "$BUILD/$1/BookingApi.dll" </dev/null >"$LOG_DIR/api-$1.log" 2>&1 &
  APP_PID=$!
  wait_for "the booking API" "$STARTUP_TIMEOUT" healthy || { tail -20 "$LOG_DIR/api-$1.log" >&2; exit 1; }
}

# start_mock <name> <recording> [redis]: proxymock answers schedule, pricing and payment calls (and Redis) from the recording.
start_mock() {
  local name="$1" dir="$2" maps=(--map "$SCHEDULE_PORT=http://localhost:5051" --map "$PRICING_PORT=http://localhost:5052" --map "$PAYMENTS_PORT=http://localhost:5053")
  [ "${3:-}" = redis ] && maps+=(--map "$REDIS_MOCK_PORT=redis://localhost:6390")
  stop_mock
  "$PROXYMOCK" mock --no-passthrough --no-cert-install --in "$dir" --out "$RESULTS/mock-$name" --proxy-out-port "$PROXY_PORT" "${maps[@]}" \
    </dev/null >"$LOG_DIR/mock-$name.log" 2>&1 &
  MOCK_PID=$!
  wait_for "proxymock" "$STARTUP_TIMEOUT" port_in_use "$PAYMENTS_PORT" || { tail -20 "$LOG_DIR/mock-$name.log" >&2; exit 1; }
}

# mock_counts <name>: "hits/misses" the mock recorded; call after stop_mock.
mock_counts() {
  local f="$RESULTS/mock-$1/responder-counts.json"
  [ -f "$f" ] || { echo "?"; return; }
  sed -E 's/.*"hits":([0-9]+).*"misses":([0-9]+).*/\1 hits, \2 misses/' "$f"
}

start_redis() {
  docker rm -f "$REDIS_CONTAINER" >/dev/null 2>&1
  if ! docker image inspect "$REDIS_IMAGE" >/dev/null 2>&1; then
    say "pulling $REDIS_IMAGE (first run only)"
    docker pull -q "$REDIS_IMAGE" >/dev/null || die "could not pull $REDIS_IMAGE"
  fi
  docker run -d --name "$REDIS_CONTAINER" -p "127.0.0.1:$REDIS_PORT:6379" "$REDIS_IMAGE" >/dev/null || die "could not start Redis"
  wait_for "Redis" "$STARTUP_TIMEOUT" docker exec "$REDIS_CONTAINER" redis-cli ping || exit 1
}
flush_redis() { docker exec "$REDIS_CONTAINER" redis-cli FLUSHALL >/dev/null; }

# replay <name> <dir>: replays inbound RRPairs and prints "replayed/matched".
replay() {
  "$PROXYMOCK" replay --no-cert-install --in "$2" --test-against "http://127.0.0.1:$API_PORT" --out "$RESULTS/replay-$1" \
    --timeout "${STEP_TIMEOUT}s" --fail-if "requests.response-match-pct<100" >"$LOG_DIR/replay-$1.log" 2>&1
  local rc=$? s="$RESULTS/replay-$1/replay-summary.json" n="" bad=""
  if [ -f "$s" ]; then
    n=$(tr -d ' \n' <"$s" | sed -nE 's/.*"requests":\{"replayed":([0-9]+),"mismatched":([0-9]+)\}.*/\1/p')
    bad=$(tr -d ' \n' <"$s" | sed -nE 's/.*"requests":\{"replayed":([0-9]+),"mismatched":([0-9]+)\}.*/\2/p')
  fi
  n=${n:-0} bad=${bad:-0}
  REPLAY_RESULT="$((n - bad)) of $n responses matched"
  return "$rc"
}

# property <name>: runs the ephyra property test against the running API.
property() {
  (cd property-tests && export API_URL="http://127.0.0.1:$API_PORT" && \
    with_timeout "$STEP_TIMEOUT" cargo test -q --locked --test booking -- --nocapture) >"$LOG_DIR/property-$1.log" 2>&1
}

SUMMARY=()
record() { SUMMARY+=("$(printf '%-36s %-7s %s' "$1" "$2" "$3")"); }
outcome() { if [ "$1" -eq 0 ]; then echo passed; else echo failed; fi; }

# ---------------------------------------------------------------- run

step "Build"
build current
build changed "$CHANGE"
say "property test: compiling"
(cd property-tests && with_timeout "$STEP_TIMEOUT" cargo test -q --locked --test booking --no-run) >"$LOG_DIR/cargo-build.log" 2>&1 \
  || { tail -20 "$LOG_DIR/cargo-build.log" >&2; die "property test did not compile (log: logs/cargo-build.log)"; }
say "ports: api $API_PORT, schedule $SCHEDULE_PORT, pricing $PRICING_PORT, payments $PAYMENTS_PORT, redis mock $REDIS_MOCK_PORT, redis $REDIS_PORT"

for b in current changed; do
  step "Replay the recording against the $b build, partners and Redis mocked from the recording"
  start_mock "recorded-$b" "$RECORDING" redis
  start_app "$b" "$REDIS_MOCK_PORT"
  replay "recorded-$b" "$RECORDING"
  rc=$?
  stop_app
  stop_mock
  say "$REPLAY_RESULT; mock: $(mock_counts "recorded-$b")"
  record "recorded replay, $b build" "$(outcome $rc)" "$REPLAY_RESULT; mock $(mock_counts "recorded-$b")"
done

start_redis
rm -rf "$REGRESSIONS"
for b in current changed; do
  step "ephyra property test against the $b build, partners mocked from the recording (seed $EPHYRA_SEED)"
  flush_redis
  start_mock "property-$b" "$PARTNERS"
  start_app "$b" "$REDIS_PORT"
  property "$b"
  rc=$?
  stop_app
  stop_mock
  grep -E "^(ephyra|  (counterexample|shrinking|reproduce|original)|first failing input|shrunk booking)" "$LOG_DIR/property-$b.log" | sed 's/^/  /'
  if [ "$rc" -eq 0 ]; then
    detail="$EPHYRA_TESTS generated bookings"
    say "$detail passed"
  else
    detail="$(sed -nE 's/^first failing input: (generated case [0-9]+).*/first failure at \1/p' "$LOG_DIR/property-$b.log" | head -1)"
    [ -n "$detail" ] || { tail -30 "$LOG_DIR/property-$b.log" >&2; detail="see logs/property-$b.log"; }
  fi
  say "mock: $(mock_counts "property-$b")"
  record "property test, $b build" "$(outcome $rc)" "$detail; mock $(mock_counts "property-$b")"
done

if [ -d "$REGRESSIONS" ]; then
  for b in current changed; do
    step "Replay the RRPairs the property test wrote against the $b build"
    flush_redis
    start_mock "regression-$b" "$PARTNERS"
    start_app "$b" "$REDIS_PORT"
    replay "regression-$b" "$REGRESSIONS"
    rc=$?
    stop_app
    stop_mock
    say "$REPLAY_RESULT; mock: $(mock_counts "regression-$b")"
    record "written RRPairs, $b build" "$(outcome $rc)" "$REPLAY_RESULT; mock $(mock_counts "regression-$b")"
  done
fi

step "Summary (seed $EPHYRA_SEED)"
printf '%s\n' "${SUMMARY[@]}"
say "logs: logs/   mock and replay output: proxymock/results/"

# Expected: both recorded replays pass, the property passes on the current build and fails on the
# changed build, and the written RRPairs pass on the current build and fail on the changed one.
expected=("recorded replay, current build *passed" "recorded replay, changed build *passed" "property test, current build *passed"
  "property test, changed build *failed" "written RRPairs, current build *passed" "written RRPairs, changed build *failed")
for i in "${!expected[@]}"; do
  [[ "${SUMMARY[$i]:-}" == ${expected[$i]}* ]] || { say "result $((i + 1)) differs from the expected outcome"; exit 1; }
done
