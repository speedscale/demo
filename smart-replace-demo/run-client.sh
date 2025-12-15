#!/bin/bash
# Run Client - Test mock/replay workflow
#
# Usage: ./run-client.sh [recorded-directory]
# Example: ./run-client.sh recorded-2025-10-29_16-18-04

set -e

RECORDED_DIR="${1:-recorded-2025-10-29_16-18-04}"
MOCKED_DIR="mocked-$(date +%Y%m%d-%H%M%S)"
REPLAYED_DIR="replayed-$(date +%Y%m%d-%H%M%S)"

echo "Testing with: ${RECORDED_DIR}"
echo ""

# Kill any existing processes
echo "Killing existing processes..."
pkill -9 -f "node server.js" 2>/dev/null || true
pkill -9 -f "proxymock" 2>/dev/null || true
sleep 2

# Start mock server
echo "Starting mock server..."
proxymock mock --in "${RECORDED_DIR}" --out "${MOCKED_DIR}" > /tmp/mock.log 2>&1 &
MOCK_PID=$!
sleep 5

# Start cart service with proxy
echo "Starting cart service..."
HTTP_PROXY=http://localhost:4140 node server.js > /tmp/cart.log 2>&1 &
CART_PID=$!
sleep 4

# Run replay
echo "Running replay..."
proxymock replay \
  --in "${RECORDED_DIR}" \
  --test-against http://localhost:8080 \
  --out "${REPLAYED_DIR}" \
  > /tmp/replay.log 2>&1 || true

sleep 2

# Cleanup
kill ${MOCK_PID} 2>/dev/null || true
kill ${CART_PID} 2>/dev/null || true

# Check results
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "                        RESULTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

BAD_GATEWAY=$(find "${MOCKED_DIR}" -name "*.md" -exec grep -l "502 Bad Gateway" {} \; 2>/dev/null | wc -l | tr -d ' ')
TOTAL_MOCKED=$(find "${MOCKED_DIR}" -name "*.md" 2>/dev/null | wc -l | tr -d ' ')
NO_MATCH=$(grep -c "NO MATCH" /tmp/mock.log 2>/dev/null || echo "0")

echo "502 Bad Gateway responses: ${BAD_GATEWAY}"
echo "Total mocked RRPairs: ${TOTAL_MOCKED}"
echo "NO MATCH count: ${NO_MATCH}"
echo ""
echo "Logs:"
echo "  Mock:   /tmp/mock.log"
echo "  Cart:   /tmp/cart.log"
echo "  Replay: /tmp/replay.log"
echo ""

if [ "${BAD_GATEWAY}" -eq 0 ] && [ "${NO_MATCH}" -eq 0 ]; then
    echo "✅ SUCCESS - All mocks matched!"
    exit 0
else
    echo "❌ FAILURE - ${BAD_GATEWAY} mock failures, ${NO_MATCH} no-matches"
    echo ""
    echo "To debug:"
    echo "  grep 'NO MATCH' -A 30 /tmp/mock.log | head -80"
    exit 1
fi
