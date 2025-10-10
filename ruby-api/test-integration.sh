#!/usr/bin/env bash

# Integration test script
# Runs the app with proxymock replay to validate functionality

set -e
set -o pipefail 2>/dev/null || true

APP_PORT=3000
APP_COMMAND="bundle exec ruby app.rb"
PROXYMOCK_IN_DIR="proxymock/snapshot-f82bffb3-62ae-400a-aed4-f2cfba94630e"

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

run_integration_test() {
  INTEGRATION_LOG_FILE="proxymock_integration.log"
  print_logs() {
    echo ""
    echo "=== Integration Test Results ==="
    if [ -f "$INTEGRATION_LOG_FILE" ]; then
      tail -50 $INTEGRATION_LOG_FILE
    else
      echo "Log file not found - test may have failed early"
    fi
  }
  trap print_logs EXIT

  echo "Running integration test with proxymock replay..."

  # Run proxymock replay with the app, validating that no requests fail
  proxymock replay \
    --in "$PROXYMOCK_IN_DIR" \
    --test-against localhost:$APP_PORT \
    --log-to $INTEGRATION_LOG_FILE \
    --fail-if "requests.failed != 0" \
    -- $APP_COMMAND
}

main() {
  validate
  install_proxymock
  run_integration_test

  echo ""
  echo "✓ Integration test completed"
}

main
