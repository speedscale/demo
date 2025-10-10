#!/usr/bin/env bash

# set the port your application will listen on, where traffic will be replayed
APP_PORT=3000
# set the command to run your application
APP_COMMAND="bundle exec ruby app.rb"
# the path to pre-recorded proxymock traffic
PROXYMOCK_IN_DIR="proxymock/snapshot-f82bffb3-62ae-400a-aed4-f2cfba94630e"
# optionally, run mock server
RUN_MOCK_SERVER=true
# run client load test before replay
RUN_LOAD_TEST=true
LOAD_TEST_DURATION=60

###########################
### USER SETTINGS ABOVE ###
###    SCRIPT BELOW     ###
###########################

set -e
set -o pipefail 2>/dev/null || true

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
  if [ "$RUN_LOAD_TEST" = "true" ]; then
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
  fi
}

run_replay() {
  REPLAY_LOG_FILE="proxymock_replay.log"
  print_replay_log() {
    cat $REPLAY_LOG_FILE
  }
  trap print_replay_log EXIT

  # start proxymock replay, with your app, to run your app and replay test traffic
  # against it
  proxymock replay \
    --in "$PROXYMOCK_IN_DIR" \
    --test-against localhost:$APP_PORT \
    --log-to $REPLAY_LOG_FILE \
    --fail-if "latency.p95 > 2000" \
    --fail-if "latency.max > 5000" \
    -- $APP_COMMAND
}

main() {
  validate
  install_proxymock

  if [ "$RUN_MOCK_SERVER" = "true" ]; then
    run_mock_server
  fi

  # Run load test in a subshell that starts the app, runs the client, then stops the app
  if [ "$RUN_LOAD_TEST" = "true" ]; then
    (
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
    )
  fi

  run_replay
}

main
