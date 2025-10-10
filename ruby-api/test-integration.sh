#!/usr/bin/env bash

# Integration / Load test script
# Runs the app with proxymock mock server and client load test

set -e
set -o pipefail 2>/dev/null || true

APP_PORT=3000
APP_COMMAND="bundle exec ruby app.rb"
PROXYMOCK_IN_DIR="proxymock/snapshot-f82bffb3-62ae-400a-aed4-f2cfba94630e"
LOAD_TEST_DURATION=60

###########################
### USER SETTINGS ABOVE ###
###    SCRIPT BELOW     ###
###########################

validate() {
  if [ -z "$SPEEDSCALE_API_KEY" ]; then
  	echo "ERROR: SPEEDSCALE_API_KEY environment variable is not set"
  	exit 1
  fi

  if [ ! -d "$PROXYMOCK_IN_DIR" ]; then
  	echo "ERROR: $PROXYMOCK_IN_DIR does not exist - make sure you have pre-recorded traffic to mock / replay"
  	exit 1
  fi
}

install_proxymock() {
  echo "Installing proxymock..."

  sh -c "$(curl -Lfs https://downloads.speedscale.com/proxymock/install-proxymock)" > /dev/null 2>&1
  export PATH=${PATH}:${HOME}/.speedscale

  echo "✓ proxymock installed"
}

run_mock_server() {
  echo "Starting mock server..."

  proxymock mock \
    --in $PROXYMOCK_IN_DIR/ \
    --log-to proxymock_mock.log > /dev/null 2>&1 &

  sleep 2
  echo "✓ Mock server started (logs: proxymock_mock.log)"
}

run_load_test() {
  echo "Running client load test for ${LOAD_TEST_DURATION}s..."

  cd client
  export SERVER_URL=http://localhost:$APP_PORT
  bundle exec ruby client.rb > ../client.log 2>&1 &
  CLIENT_PID=$!
  cd ..

  sleep $LOAD_TEST_DURATION

  echo "Stopping client load test..."
  kill $CLIENT_PID 2>/dev/null || true
  wait $CLIENT_PID 2>/dev/null || true

  echo "Load test completed"
}

main() {
  validate
  install_proxymock
  run_mock_server

  echo "Starting app for load test..."
  $APP_COMMAND > app_loadtest.log 2>&1 &
  APP_PID=$!

  # Wait for app to be ready
  echo -n "Waiting for app to be ready"
  for i in $(seq 1 30); do
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:$APP_PORT/health | grep -q "200"; then
      echo ""
      echo "✓ App ready for load test"
      break
    fi
    echo -n "."
    sleep 2
  done

  run_load_test

  # Stop the app
  echo "Stopping load test app..."
  kill $APP_PID 2>/dev/null || true
  wait $APP_PID 2>/dev/null || true

  echo ""
  echo "✓ Integration test completed"
}

main
