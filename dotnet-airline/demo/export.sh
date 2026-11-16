#!/usr/bin/env bash
# Regenerate the Gatling and k6 exports from a recording, then correlate cart IDs and record locators.
source "$(dirname "$0")/common.sh"
IN="${1:-proxymock/recording}"
$PROXYMOCK export gatling --in "$IN" --out exports/BookingJourneys.java >/dev/null
$PROXYMOCK export k6 --in "$IN" --out exports/booking-journeys.js >/dev/null
python3 "$(dirname "$0")/correlate_exports.py" "$IN" exports/BookingJourneys.java exports/booking-journeys.js
