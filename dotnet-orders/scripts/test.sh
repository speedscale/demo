#!/bin/bash
set -euo pipefail

HOST="${1:-localhost:8082}"

echo "==> POST /orders (create)"
RESPONSE=$(curl -sf -X POST "http://${HOST}/orders" \
  -H "Content-Type: application/json" \
  -d '{"item":"widget","quantity":2}')
echo "${RESPONSE}" | jq .
ORDER_ID=$(echo "${RESPONSE}" | jq -r '.orderId')
echo "  orderId: ${ORDER_ID}"

echo ""
echo "==> POST /orders/confirm (confirm with same orderId)"
curl -sf -X POST "http://${HOST}/orders/confirm" \
  -H "Content-Type: application/json" \
  -d "{\"orderId\":\"${ORDER_ID}\"}" | jq .

echo ""
echo "==> GET /orders (list)"
curl -sf "http://${HOST}/orders" | jq .
