#!/usr/bin/env bash

set -euo pipefail

PORT=${PORT:-4143}
BASE_URL=${BASE_URL:-http://localhost:${PORT}}

curl -sS "${BASE_URL}/"

echo
curl -sS "${BASE_URL}/profile"

echo
curl -sS "${BASE_URL}/payment"

echo
curl -sS "${BASE_URL}/audit"

echo
curl -sS "${BASE_URL}/ids"
