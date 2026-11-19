#!/bin/bash
# Records the traffic the fast lane replays: starts MySQL and the deployed
# image behind proxymock, then sends traffic.sh through the inbound proxy.
set -euo pipefail

IMAGE="${1:?usage: fast-lane-record.sh <image>}"
RECORDING="${RECORDING:-proxymock/recording}"
PROXYMOCK="${PROXYMOCK:-proxymock}"
APP_PORT="${APP_PORT:-8091}"
DB_PORT="${DB_PORT:-3317}"

cleanup() {
  docker rm -f fast-lane-app fast-lane-mysql >/dev/null 2>&1 || true
  [ -n "${RECORD_PID:-}" ] && kill -INT "$RECORD_PID" 2>/dev/null && wait "$RECORD_PID" 2>/dev/null || true
}
trap cleanup EXIT
cleanup

docker run -d --name fast-lane-mysql -p "$DB_PORT":3306 \
  -e MYSQL_ROOT_PASSWORD=rootpassword -e MYSQL_DATABASE=auth_db \
  -e MYSQL_USER=auth_user -e MYSQL_PASSWORD=secure_password mysql:8.0 >/dev/null
until docker exec fast-lane-mysql mysql -uauth_user -psecure_password -e 'select 1' auth_db >/dev/null 2>&1; do sleep 2; done

rm -rf "$RECORDING"
"$PROXYMOCK" record --app-port "$APP_PORT" --map "13306=mysql://localhost:$DB_PORT" --out "$RECORDING" >/dev/null 2>&1 &
RECORD_PID=$!
until nc -z localhost 13306 2>/dev/null; do sleep 1; done

# A ten-year token lifetime keeps the recorded tokens valid at replay time.
docker run -d --name fast-lane-app -p "$APP_PORT":8081 \
  -e MYSQL_HOST=host.docker.internal -e MYSQL_PORT=13306 \
  -e JWT_EXPIRATION=315360000000 "$IMAGE" >/dev/null
until curl -sf "localhost:$APP_PORT/api/auth/health" >/dev/null 2>&1; do sleep 2; done

./traffic.sh localhost:4143
sleep 2
