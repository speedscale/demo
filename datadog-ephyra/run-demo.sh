#!/usr/bin/env bash
# Replays the dotnet-airline recording with every dependency mocked, then runs an ephyra property test
# that books generated fares and passenger counts and checks the order total.
# Needs the .NET 8 SDK, docker (for Redis), cargo and proxymock. The app and its dependencies run locally.
set -uo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
AIRLINE="$(cd "$HERE/../dotnet-airline" && pwd)"
RECORDING="$AIRLINE/proxymock/recording"
PROXYMOCK="${PROXYMOCK:-$HOME/.speedscale/proxymock}"
[ -x "$PROXYMOCK" ] || PROXYMOCK="$(command -v proxymock)"
if [ -x "$HOME/.dotnet/dotnet" ]; then export DOTNET_ROOT="$HOME/.dotnet" PATH="$HOME/.dotnet:$PATH"; fi
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1

API_PORT=18090
SCHEDULE_PORT=25051
PRICING_PORT=25052
PAYMENTS_PORT=25053
REDIS_MOCK_PORT=26390
REDIS_PORT=26391
REDIS_CONTAINER=ephyra-airline-redis
REDIS_IMAGE="${REDIS_IMAGE:-redis:7-alpine}"
BUILD="$HERE/.build"
LOG_DIR="$HERE/logs"
RESULTS="$HERE/proxymock/results"
PARTNERS="$HERE/proxymock/recorded-partners"
REGRESSIONS="$HERE/proxymock/regressions-ephyra"

mkdir -p "$LOG_DIR" "$RESULTS"
cd "$HERE" || exit 1

step() { printf '\n\033[1m== %s\033[0m\n' "$*"; }

APP_PID=""
MOCK_PID=""
stop_app() { [ -n "$APP_PID" ] && kill "$APP_PID" 2>/dev/null && wait "$APP_PID" 2>/dev/null; APP_PID=""; }
stop_mock() { [ -n "$MOCK_PID" ] && kill -INT "$MOCK_PID" 2>/dev/null && wait "$MOCK_PID" 2>/dev/null; MOCK_PID=""; }
stop_all() {
  stop_app
  stop_mock
  docker rm -f "$REDIS_CONTAINER" >/dev/null 2>&1
}
trap stop_all EXIT

wait_port() { # port
  for _ in $(seq 60); do nc -z 127.0.0.1 "$1" 2>/dev/null && return 0; sleep 0.5; done
  echo "nothing listening on port $1" >&2
  return 1
}

for port in $API_PORT $SCHEDULE_PORT $PRICING_PORT $PAYMENTS_PORT $REDIS_MOCK_PORT $REDIS_PORT; do
  if nc -z 127.0.0.1 "$port" 2>/dev/null; then echo "port $port is already in use" >&2; exit 1; fi
done

# build <name> [patch]: builds the booking API from dotnet-airline, optionally with a patch applied, into .build/<name>.
build() {
  local src="$BUILD/$1-src"
  rm -rf "$src" && mkdir -p "$src/src"
  cp "$AIRLINE/global.json" "$src/"
  cp -R "$AIRLINE/src/BookingApi" "$src/src/"
  rm -rf "$src/src/BookingApi/bin" "$src/src/BookingApi/obj"
  [ -n "${2:-}" ] && patch -s -p1 -d "$src" <"$2"
  dotnet build "$src/src/BookingApi/BookingApi.csproj" -c Release -v quiet -nologo -o "$BUILD/$1" >"$LOG_DIR/build-$1.log" 2>&1 \
    || { tail -20 "$LOG_DIR/build-$1.log" >&2; exit 1; }
}

# start_app <build> <redis port>: the API reaches its partners and Redis on local ports.
start_app() {
  stop_app
  SCHEDULE_URL="http://127.0.0.1:$SCHEDULE_PORT" PRICING_URL="http://127.0.0.1:$PRICING_PORT" \
    PAYMENTS_URL="http://127.0.0.1:$PAYMENTS_PORT" REDIS_ADDR="127.0.0.1:$2" PORT="$API_PORT" \
    dotnet "$BUILD/$1/BookingApi.dll" </dev/null >"$LOG_DIR/api-$1.log" 2>&1 &
  APP_PID=$!
  for _ in $(seq 60); do
    curl -sf -o /dev/null "http://127.0.0.1:$API_PORT/healthz" && return 0
    sleep 0.5
  done
  echo "booking API did not become healthy" >&2
  tail -20 "$LOG_DIR/api-$1.log" >&2
  exit 1
}

# mock <name> <wait port> <proxymock mock args...>
mock() {
  local name="$1" port="$2"
  shift 2
  stop_mock
  "$PROXYMOCK" mock --no-passthrough --out "$RESULTS/mock-$name" "$@" </dev/null >"$LOG_DIR/mock-$name.log" 2>&1 &
  MOCK_PID=$!
  wait_port "$port" || { tail -20 "$LOG_DIR/mock-$name.log" >&2; exit 1; }
}

fresh_redis() {
  docker rm -f "$REDIS_CONTAINER" >/dev/null 2>&1
  docker run -d --name "$REDIS_CONTAINER" -p "$REDIS_PORT:6379" "$REDIS_IMAGE" >/dev/null || exit 1
  wait_port "$REDIS_PORT" || exit 1
}

replay() { # <name> <dir>
  "$PROXYMOCK" replay --in "$2" --test-against "http://127.0.0.1:$API_PORT" --out "$RESULTS/replay-$1" \
    --fail-if "requests.response-match-pct<100" 2>&1 | tee "$LOG_DIR/replay-$1.log" | tail -4
  return "${PIPESTATUS[0]}"
}

property() { # <name>
  (cd property-tests && API_URL="http://127.0.0.1:$API_PORT" PRICING_ADDR="127.0.0.1:$PRICING_PORT" \
    cargo test -q --test pricing -- --nocapture 2>&1 | tee "$LOG_DIR/property-$1.log" \
    | grep -E "shrunk booking|regression RRPairs|counterexample|shrinking|reproduce|FAILED|test result")
}

step "Build the booking API from ../dotnet-airline, as is and with demo/regression.patch"
build clean
build regression "$AIRLINE/demo/regression.patch"
(cd property-tests && cargo test -q --test pricing --no-run 2>&1 | tail -3)
echo "built"

step "1. Replay the recorded journeys with the partners and Redis mocked from the recording"
mock replay "$REDIS_MOCK_PORT" --in "$RECORDING" \
  --map "$SCHEDULE_PORT=http://localhost:5051" --map "$PRICING_PORT=http://localhost:5052" \
  --map "$PAYMENTS_PORT=http://localhost:5053" --map "$REDIS_MOCK_PORT=redis://localhost:6390"
start_app clean "$REDIS_MOCK_PORT"
replay recorded "$RECORDING" && echo "REPLAY PASSED" || echo "REPLAY FAILED (unexpected)"

step "2. ephyra property on the current build: ephyra quotes the fares, proxymock mocks schedule and payments"
fresh_redis
mock partners "$PAYMENTS_PORT" --in "$PARTNERS" \
  --map "$SCHEDULE_PORT=http://localhost:5051" --map "$PAYMENTS_PORT=http://localhost:5053"
start_app clean "$REDIS_PORT"
rm -rf "$REGRESSIONS"
property clean

step "3. The same property on the build with demo/regression.patch"
start_app regression "$REDIS_PORT"
property regression
echo "(failure above is the finding)"
[ -d "$REGRESSIONS" ] || { echo "no regression RRPairs written (unexpected)" >&2; exit 1; }

step "4. Replay the regression RRPairs the property test wrote, with the shrunk quote mocked"
mock regression "$PRICING_PORT" --in "$REGRESSIONS" --map "$PRICING_PORT=http://localhost:5052"
for b in clean regression; do
  docker exec "$REDIS_CONTAINER" redis-cli FLUSHALL >/dev/null
  start_app "$b" "$REDIS_PORT"
  echo "-- $b build"
  if replay "regression-$b" "$REGRESSIONS"; then
    echo "REGRESSION PASSED on the $b build"
  elif grep -qE "failed to initialize|no test or mock files found" "$LOG_DIR/replay-regression-$b.log"; then
    echo "REGRESSION RRPAIRS REJECTED (demo error)" >&2
    exit 1
  else
    echo "REGRESSION FAILED on the $b build"
  fi
done
