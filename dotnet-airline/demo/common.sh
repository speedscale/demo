# Shared settings for the demo scripts. Override PROXYMOCK to pin a binary or add --config/--context.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
PROXYMOCK="${PROXYMOCK:-proxymock}"
# Prefer a user-local .NET install when present.
if [ -x "$HOME/.dotnet/dotnet" ]; then export DOTNET_ROOT="$HOME/.dotnet" PATH="$HOME/.dotnet:$PATH"; fi
export DOTNET_CLI_TELEMETRY_OPTOUT=1 DOTNET_NOLOGO=1
RUN_DIR="${RUN_DIR:-.demo-run}"
mkdir -p "$RUN_DIR"
API_DLL=src/BookingApi/bin/Release/net8.0/BookingApi.dll
PARTNER_DLL=src/PartnerSim/bin/Release/net8.0/PartnerSim.dll

# The API reaches partners and Redis on these ports; proxymock maps them to the real services or serves mocks.
export SCHEDULE_URL=http://127.0.0.1:15051 PRICING_URL=http://127.0.0.1:15052 PAYMENTS_URL=http://127.0.0.1:15053
export REDIS_ADDR=127.0.0.1:16390 PORT=8090
MAPS=(--map 15051=http://localhost:5051 --map 15052=http://localhost:5052 --map 15053=http://localhost:5053 --map 16390=redis://localhost:6390)

wait_for() { # url
  for _ in $(seq 1 60); do curl -sf "$1" >/dev/null && return 0; sleep 0.5; done
  echo "timed out waiting for $1" >&2; return 1
}

build() { dotnet build -c Release -v quiet -nologo >/dev/null; }

start_backends() {
  redis-server --port 6390 --save '' --appendonly no --daemonize yes --pidfile "$PWD/$RUN_DIR/redis.pid" --logfile "$PWD/$RUN_DIR/redis.log"
  nohup dotnet "$PARTNER_DLL" >"$RUN_DIR/partner.log" 2>&1 &
  echo $! >"$RUN_DIR/partner.pid"
  wait_for "http://127.0.0.1:5051/schedule/v1/flights?origin=SLC&destination=LAX&date=x"
}

stop_backends() {
  [ -f "$RUN_DIR/partner.pid" ] && kill "$(cat "$RUN_DIR/partner.pid")" 2>/dev/null || true
  redis-cli -p 6390 shutdown nosave >/dev/null 2>&1 || true
  rm -f "$RUN_DIR/partner.pid"
  sleep 1
}

# Ports the demo binds itself; anything already listening would answer in place of the demo.
assert_ports_free() {
  local up
  up=$(lsof -nP -iTCP:8090 -iTCP:4140 -iTCP:4143 -iTCP:15051 -iTCP:15052 -iTCP:15053 -iTCP:16390 -sTCP:LISTEN 2>/dev/null | tail -n +2 || true)
  if [ -n "$up" ]; then echo "demo ports already in use:"; echo "$up"; exit 1; fi
}

# Unique per run so repeated runs never write into the same results directory.
run_tag() { echo "$(date +%H%M%S)-$$"; }

assert_backends_down() {
  local up
  up=$(lsof -nP -iTCP:5051 -iTCP:5052 -iTCP:5053 -iTCP:6390 -sTCP:LISTEN 2>/dev/null | tail -n +2 || true)
  if [ -n "$up" ]; then echo "partner/Redis ports still listening:"; echo "$up"; exit 1; fi
  echo "partners (5051-5053) and Redis (6390): not running"
}
