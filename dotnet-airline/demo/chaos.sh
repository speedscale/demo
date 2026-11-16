#!/usr/bin/env bash
# Negative scenario: replay the same journeys while the mocked payment gateway misbehaves.
#   demo/chaos.sh outage   -> gateway returns 503
#   demo/chaos.sh slow     -> gateway takes 6s (app timeout is 5s)
#   demo/chaos.sh garbage  -> gateway returns corrupt JSON
source "$(dirname "$0")/common.sh"
case "${1:-outage}" in
  outage)  EFFECT='status=503' ;;
  slow)    EFFECT='latency=6s' ;;
  garbage) EFFECT='body=corrupt' ;;
  *) echo "usage: $0 outage|slow|garbage" >&2; exit 2 ;;
esac
TAG="chaos-${1:-outage}" exec "$(dirname "$0")/mock-and-replay.sh" proxymock/recording \
  --chaos "(location REGEX \"^/payments/\"): $EFFECT"
