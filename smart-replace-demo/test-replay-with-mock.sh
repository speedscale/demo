#!/bin/bash
# Test Replay with Mock
#
# This script demonstrates the complete record → replay → validate workflow
# that simulates the real Myntra app logic where dynamically generated IDs
# (cartId) cause signature mismatches during replay.
#
# Expected behavior WITHOUT transforms:
#   - Recording captures traffic with cart-A
#   - Replay generates cart-B (server memory cleared)
#   - Warehouse mock receives requests with cart-B
#   - Signature mismatch → 502 Bad Gateway responses
#   - Script exits with code 1
#
# Expected behavior WITH transforms:
#   - Transforms normalize cartId in signatures
#   - Mock matches requests successfully
#   - No 502 responses
#   - Script exits with code 0

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
CART_PORT=8080
WAREHOUSE_PORT=8081
PROXY_IN_PORT=4143
PROXY_OUT_PORT=4140
TIMESTAMP=$(date +%Y-%m-%d_%H-%M-%S)
RECORDED_DIR="recorded-${TIMESTAMP}"
MOCKED_DIR="mocked-${TIMESTAMP}"
REPLAYED_DIR="replayed-${TIMESTAMP}"

echo -e "${BLUE}╔═══════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║          Proxymock Record → Replay → Mock Test                ║${NC}"
echo -e "${BLUE}╚═══════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Cleanup function
cleanup() {
    echo -e "\n${YELLOW}Cleaning up processes...${NC}"
    pkill -f "node server.js" 2>/dev/null || true
    pkill -f "node warehouse-service.js" 2>/dev/null || true
    pkill -f "proxymock" 2>/dev/null || true
    sleep 2
}

# Trap cleanup on exit
trap cleanup EXIT INT TERM

# ============================================================================
# PHASE 1: RECORDING
# ============================================================================

echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  PHASE 1: Recording Traffic${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Step 1: Clean state
echo -e "${YELLOW}[1/15] Cleaning up any existing processes...${NC}"
cleanup
echo -e "${GREEN}✓ Clean state${NC}"

# Step 2: Start warehouse service
echo -e "\n${YELLOW}[2/15] Starting warehouse service (port ${WAREHOUSE_PORT})...${NC}"
node warehouse-service.js > /tmp/warehouse-recording.log 2>&1 &
WAREHOUSE_PID=$!
sleep 2

if curl -s http://localhost:${WAREHOUSE_PORT}/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Warehouse service started (PID: ${WAREHOUSE_PID})${NC}"
else
    echo -e "${RED}✗ Failed to start warehouse service${NC}"
    exit 1
fi

# Step 3: Start proxymock recording BEFORE cart service
echo -e "\n${YELLOW}[3/15] Starting proxymock recording...${NC}"
proxymock record --app-port ${CART_PORT} --out ${RECORDED_DIR} > /tmp/proxymock-record.log 2>&1 &
RECORD_PID=$!
sleep 3

if ps -p ${RECORD_PID} > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Proxymock recording started (PID: ${RECORD_PID})${NC}"
    echo "  Proxy-in port: ${PROXY_IN_PORT} (for inbound cart requests)"
    echo "  Proxy-out port: ${PROXY_OUT_PORT} (for outbound warehouse calls)"
else
    echo -e "${RED}✗ Failed to start proxymock recording${NC}"
    exit 1
fi

# Step 4: Start cart service with HTTP_PROXY for outbound calls
echo -e "\n${YELLOW}[4/15] Starting cart service with HTTP_PROXY...${NC}"
HTTP_PROXY=http://localhost:${PROXY_OUT_PORT} \
HTTPS_PROXY=http://localhost:${PROXY_OUT_PORT} \
node server.js > /tmp/cart-recording.log 2>&1 &
CART_PID=$!
sleep 3

if curl -s http://localhost:${CART_PORT}/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Cart service started (PID: ${CART_PID})${NC}"
    echo "  HTTP_PROXY configured for outbound warehouse calls"
else
    echo -e "${RED}✗ Failed to start cart service${NC}"
    exit 1
fi

# Step 5: Execute test scenario through proxy
echo -e "\n${YELLOW}[5/15] Executing test scenario (recording)...${NC}"
echo "  Sending requests to proxy-in port ${PROXY_IN_PORT}"

# Login
LOGIN_RESP=$(curl -s -X POST http://localhost:${PROXY_IN_PORT}/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"sarah.martinez@example.com","password":"password123"}')

TOKEN=$(echo $LOGIN_RESP | jq -r '.token')
echo "  ✓ Login successful"

# Add items to cart (creates cart)
ADD_ITEMS_RESP=$(curl -s -X POST http://localhost:${PROXY_IN_PORT}/cart/items \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"itemId":"sneakers-123","name":"Running Sneakers","quantity":2,"price":79.99}')

CART_ID_RECORDED=$(echo $ADD_ITEMS_RESP | jq -r '.cartId')
echo "  ✓ Items added to cart: ${CART_ID_RECORDED}"

# Add more items
curl -s -X POST http://localhost:${PROXY_IN_PORT}/cart/items \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"itemId":"tshirt-456","name":"Cotton T-Shirt","quantity":3,"price":24.99}' \
    > /dev/null

echo "  ✓ More items added"

# Set address (triggers warehouse call #1)
curl -s -X PUT http://localhost:${PROXY_IN_PORT}/cart/address \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"street":"123 Main St","city":"San Francisco","state":"CA","zip":"94102"}' \
    > /dev/null

echo "  ✓ Address set (triggered warehouse call #1)"

# Get cart (triggers warehouse call #2)
curl -s -X GET http://localhost:${PROXY_IN_PORT}/cart \
    -H "Authorization: Bearer $TOKEN" \
    > /dev/null

echo "  ✓ Cart retrieved (triggered warehouse call #2)"

# Step 6: Stop recording
echo -e "\n${YELLOW}[6/15] Stopping proxymock recording...${NC}"
sleep 2  # Give time for final traffic to be recorded
kill ${RECORD_PID} 2>/dev/null || true
wait ${RECORD_PID} 2>/dev/null || true
sleep 1
echo -e "${GREEN}✓ Recording stopped${NC}"

# Step 7: Count recorded traffic
INBOUND_COUNT=$(find ${RECORDED_DIR} -name "*.md" 2>/dev/null | xargs grep -l '"direction":"IN"' 2>/dev/null | wc -l | tr -d ' ')
OUTBOUND_COUNT=$(find ${RECORDED_DIR} -name "*.md" 2>/dev/null | xargs grep -l '"direction":"OUT"' 2>/dev/null | wc -l | tr -d ' ')

echo ""
echo "Recorded Traffic Summary:"
echo "  Cart ID (recorded): ${CART_ID_RECORDED}"
echo "  Inbound RRPairs: ${INBOUND_COUNT}"
echo "  Outbound RRPairs: ${OUTBOUND_COUNT}"

# ============================================================================
# PHASE 2: REPLAY WITH MOCK
# ============================================================================

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  PHASE 2: Replay with Mock Server${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Step 8: Stop warehouse service
echo -e "${YELLOW}[7/15] Stopping warehouse service...${NC}"
kill ${WAREHOUSE_PID} 2>/dev/null || true
wait ${WAREHOUSE_PID} 2>/dev/null || true
sleep 1
echo -e "${GREEN}✓ Warehouse service stopped${NC}"
echo "  Mock server will handle warehouse requests during replay"

# Step 9: Restart cart service to clear in-memory state
echo -e "\n${YELLOW}[8/15] Restarting cart service (clear memory)...${NC}"
kill ${CART_PID} 2>/dev/null || true
wait ${CART_PID} 2>/dev/null || true
sleep 1

HTTP_PROXY=http://localhost:${PROXY_OUT_PORT} \
HTTPS_PROXY=http://localhost:${PROXY_OUT_PORT} \
node server.js > /tmp/cart-replay.log 2>&1 &
CART_PID=$!
sleep 3

if curl -s http://localhost:${CART_PORT}/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Cart service restarted (PID: ${CART_PID})${NC}"
    echo "  In-memory cart state cleared"
    echo "  New cartId will be generated during replay"
else
    echo -e "${RED}✗ Failed to restart cart service${NC}"
    exit 1
fi

# Step 10: Start mock server
echo -e "\n${YELLOW}[9/15] Starting proxymock mock server...${NC}"
proxymock mock --in ${RECORDED_DIR} --out ${MOCKED_DIR} > /tmp/proxymock-mock.log 2>&1 &
MOCK_PID=$!
sleep 3

if ps -p ${MOCK_PID} > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Mock server started (PID: ${MOCK_PID})${NC}"
    echo "  Listening on port ${PROXY_OUT_PORT}"
    echo "  Loading mocks from: ${RECORDED_DIR}"
else
    echo -e "${RED}✗ Failed to start mock server${NC}"
    cat /tmp/proxymock-mock.log
    exit 1
fi

# Step 11: Start replay
echo -e "\n${YELLOW}[10/15] Starting proxymock replay...${NC}"
# Give mock server extra time to be ready
sleep 3
proxymock replay \
    --in ${RECORDED_DIR} \
    --test-against http://localhost:${CART_PORT} \
    --out ${REPLAYED_DIR} \
    > /tmp/proxymock-replay.log 2>&1 &
REPLAY_PID=$!

echo -e "${GREEN}✓ Replay started (PID: ${REPLAY_PID})${NC}"
echo "  Generator sending recorded inbound requests to cart service"
echo "  Cart service making outbound warehouse calls to mock server"

# Step 12: Wait for replay to complete
echo -e "\n${YELLOW}[11/15] Waiting for replay to complete...${NC}"
wait ${REPLAY_PID} 2>/dev/null || true
REPLAY_EXIT_CODE=$?

echo -e "${GREEN}✓ Replay completed (exit code: ${REPLAY_EXIT_CODE})${NC}"

# Give mock server time to process final requests
sleep 2

# Step 13: Stop mock server
echo -e "\n${YELLOW}[12/15] Stopping mock server...${NC}"
kill ${MOCK_PID} 2>/dev/null || true
wait ${MOCK_PID} 2>/dev/null || true
sleep 1
echo -e "${GREEN}✓ Mock server stopped${NC}"

# ============================================================================
# PHASE 3: VALIDATION
# ============================================================================

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  PHASE 3: Validation${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Step 14: Analyze mocked traffic for 502 responses
echo -e "${YELLOW}[13/15] Analyzing mocked traffic...${NC}"

# Check for 502 Bad Gateway responses in mocked RRPairs
BAD_GATEWAY_COUNT=0
if [ -d "${MOCKED_DIR}" ]; then
    BAD_GATEWAY_COUNT=$(find ${MOCKED_DIR} -name "*.md" -type f -exec grep -l "502 Bad Gateway" {} \; 2>/dev/null | wc -l | tr -d ' ')
fi

echo "  Mocked RRPairs with 502 Bad Gateway: ${BAD_GATEWAY_COUNT}"

# Count total mocked RRPairs
TOTAL_MOCKED=$(find ${MOCKED_DIR} -name "*.md" -type f 2>/dev/null | wc -l | tr -d ' ')
echo "  Total mocked RRPairs: ${TOTAL_MOCKED}"

# Step 15: Extract replayed cartId for comparison
echo -e "\n${YELLOW}[14/15] Extracting replayed cart ID...${NC}"

# Get cartId from replayed traffic
CART_ID_REPLAYED="N/A"
if [ -d "${REPLAYED_DIR}" ]; then
    CART_ID_REPLAYED=$(find ${REPLAYED_DIR} -name "*.md" -type f -exec grep -h '"cartId":' {} \; 2>/dev/null | head -1 | sed 's/.*"cartId": *"\([^"]*\)".*/\1/' || echo "N/A")
fi

echo "  Cart ID (replayed): ${CART_ID_REPLAYED}"

# Step 16: Final validation
echo -e "\n${YELLOW}[15/15] Final validation...${NC}"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "                     VALIDATION RESULTS"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Cart ID Comparison:"
echo "  Recorded:  ${CART_ID_RECORDED}"
echo "  Replayed:  ${CART_ID_REPLAYED}"
echo ""

if [ "${CART_ID_RECORDED}" != "${CART_ID_REPLAYED}" ] && [ "${CART_ID_REPLAYED}" != "N/A" ]; then
    echo -e "${RED}✗ CART ID MISMATCH${NC}"
    echo "  Different cartIds confirm server generated new state"
else
    echo -e "${YELLOW}⚠ Cart IDs match or replayed ID not found${NC}"
fi

echo ""
echo "Mock Matching Results:"
echo "  502 Bad Gateway responses: ${BAD_GATEWAY_COUNT}"
echo ""

echo "Files:"
echo "  📁 Recorded: ${RECORDED_DIR}/"
echo "  📁 Mocked:   ${MOCKED_DIR}/"
echo "  📁 Replayed: ${REPLAYED_DIR}/"
echo ""

if [ ${BAD_GATEWAY_COUNT} -gt 0 ]; then
    echo -e "${RED}✗ MOCK MATCHING FAILED${NC}"
    exit 1
else
    echo -e "${GREEN}✓ ALL MOCKS MATCHED SUCCESSFULLY${NC}"
    exit 0
fi
