#!/usr/bin/env bash
set -euo pipefail

PORT="${1:-4143}"
CSV_FILE="users.csv"

if [ ! -f "${CSV_FILE}" ]; then
  echo "users.csv not found"
  exit 1
fi

echo "Generating authenticated traffic for users via :${PORT}"

while IFS=, read -r username password user_id shift; do
  if [ "${username}" = "username" ]; then
    continue
  fi

  echo "- ${username} (${shift}): login"
  login_resp=$(curl -sf -X POST "http://localhost:${PORT}/login" \
    -H 'Content-Type: application/json' \
    -d "{\"username\":\"${username}\",\"password\":\"${password}\"}")
  token=$(printf "%s" "${login_resp}" | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])" 2>/dev/null || true)
  if [ -z "${token}" ]; then
    echo "  FAIL: login failed for ${username}"
    echo "  Response: ${login_resp}"
    exit 1
  fi

  list_resp=$(curl -sf "http://localhost:${PORT}/products" \
    -H "Authorization: Bearer ${token}")
  count=$(printf "%s" "${list_resp}" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
  echo "  Listed products (${count})"

  created=$(curl -sf -X POST "http://localhost:${PORT}/products" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer ${token}" \
    -d "{\"name\":\"${username} item\",\"price\":15.50,\"quantity\":3}")
  product_id=$(printf "%s" "${created}" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || true)
  if [ -z "${product_id}" ]; then
    echo "  FAIL: create failed for ${username}"
    echo "  Response: ${created}"
    exit 1
  fi
  echo "  Created product ${product_id}"

  curl -sf "http://localhost:${PORT}/products/${product_id}" \
    -H "Authorization: Bearer ${token}" >/dev/null
  echo "  Read product ${product_id}"

  curl -sf -X PUT "http://localhost:${PORT}/products/${product_id}" \
    -H 'Content-Type: application/json' \
    -H "Authorization: Bearer ${token}" \
    -d "{\"name\":\"${username} item updated\",\"price\":18.75,\"quantity\":5}" >/dev/null
  echo "  Updated product ${product_id}"

  curl -sf -X DELETE "http://localhost:${PORT}/products/${product_id}" \
    -H "Authorization: Bearer ${token}" >/dev/null
  echo "  Deleted product ${product_id}"
done < "${CSV_FILE}"

curl -sf "http://localhost:${PORT}/health" >/dev/null
echo "Done: all users completed login + CRUD traffic"
