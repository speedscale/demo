#!/usr/bin/env bash

# Replay test script
# Runs proxymock replay against the app to verify performance

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

run_replay() {
  REPLAY_LOG_FILE="proxymock_replay.log"
  print_logs() {
    echo ""
    echo "=== Replay Results ==="
    # Only show the summary section, not the full verbose log
    tail -100 $REPLAY_LOG_FILE
  }
  trap print_logs EXIT

  # start proxymock replay, with your app, to run your app and replay test traffic
  # against it
  proxymock replay \
    --in "$PROXYMOCK_IN_DIR" \
    --test-against localhost:$APP_PORT \
    --log-to $REPLAY_LOG_FILE \
    --fail-if "latency.p95 > 300" \
    --fail-if "latency.max > 600" \
    -- $APP_COMMAND > /dev/null 2>&1
}

main() {
  validate
  install_proxymock
  run_replay
}

main
