#!/usr/bin/env bash

# Load test script
# Runs proxymock replay with virtual users and duration to verify performance under load

set -e
set -o pipefail 2>/dev/null || true

APP_PORT=3000
APP_COMMAND="bundle exec ruby app.rb"
PROXYMOCK_IN_DIR="proxymock/snapshot-f82bffb3-62ae-400a-aed4-f2cfba94630e"
LOAD_TEST_VU=3
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

run_load_test() {
  LOAD_LOG_FILE="proxymock_load.log"

  echo "Running load test with ${LOAD_TEST_VU} virtual users for ${LOAD_TEST_DURATION}s..."

  # Run proxymock replay with VUs and duration to simulate load
  # Redirect app output to /dev/null to avoid cluttering logs
  set +e  # Temporarily disable exit on error to capture exit code
  proxymock replay \
    --in "$PROXYMOCK_IN_DIR" \
    --test-against localhost:$APP_PORT \
    --log-to $LOAD_LOG_FILE \
    --vus $LOAD_TEST_VU \
    --for ${LOAD_TEST_DURATION}s \
    --fail-if "latency.p95 > 800" \
    --fail-if "latency.max > 1200" \
    --no-out \
    -- bash -c "$APP_COMMAND > /dev/null 2>&1"

  PROXYMOCK_EXIT_CODE=$?
  set -e  # Re-enable exit on error

  # Print truncated results after test completes
  echo ""
  echo "=== Load Test Results ==="
  if [ -f "$LOAD_LOG_FILE" ]; then
    tail -25 $LOAD_LOG_FILE
  else
    echo "Log file not found"
  fi

  # Exit with proxymock's exit code
  if [ $PROXYMOCK_EXIT_CODE -ne 0 ]; then
    echo ""
    echo "Load test failed with exit code $PROXYMOCK_EXIT_CODE"
    exit $PROXYMOCK_EXIT_CODE
  fi
}

main() {
  validate
  install_proxymock
  run_load_test
}

main
