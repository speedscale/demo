#!/bin/bash
# Test Scenario 3: Cross-Session Cart Access
# Demonstrates complex scenario combining implicit and explicit access patterns
#
# Expected Behavior:
# - Recording: Captures mixed session-based and explicit access to same cart
# - Replay WITHOUT transforms: FAILS - multiple signature mismatches
# - Replay WITH transforms: SUCCEEDS - smart_replace handles complex ID tracking

set -e

BASE_URL="${BASE_URL:-http://localhost:8080}"
echo "Testing cross-session cart access flow against $BASE_URL"
echo "========================================================="

# Session A: Sarah creates cart via implicit access
echo -e "\n=== SESSION A: Sarah (Implicit Access) ==="
LOGIN_SARAH=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"sarah.martinez@example.com","password":"password123"}')

TOKEN_SARAH=$(echo $LOGIN_SARAH | jq -r '.token')
echo "1. Logged in as Sarah"

# Create cart implicitly
ADD_ITEM_A1=$(curl -s -X POST "$BASE_URL/cart/items" \
  -H "Authorization: Bearer $TOKEN_SARAH" \
  -H "Content-Type: application/json" \
  -d '{"itemId":"watch-111","name":"Smartwatch","quantity":1,"price":299.99}')

CART_ID=$(echo $ADD_ITEM_A1 | jq -r '.cartId')
echo "2. Created cart (implicit): $CART_ID"

# Add more items implicitly
ADD_ITEM_A2=$(curl -s -X POST "$BASE_URL/cart/items" \
  -H "Authorization: Bearer $TOKEN_SARAH" \
  -H "Content-Type: application/json" \
  -d '{"itemId":"band-222","name":"Watch Band","quantity":2,"price":29.99}')

echo "3. Added items (implicit), Total: $(echo $ADD_ITEM_A2 | jq -r '.total')"

# Get cart implicitly
GET_CART_A=$(curl -s -X GET "$BASE_URL/cart" \
  -H "Authorization: Bearer $TOKEN_SARAH")

echo "4. Retrieved cart (implicit): $(echo $GET_CART_A | jq -r '.items | length') items"

# Session B: Sarah accesses same cart explicitly by ID
echo -e "\n=== SESSION B: Sarah (Explicit Access to Same Cart) ==="
# Simulate new session - login again to get fresh token
LOGIN_SARAH_B=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"sarah.martinez@example.com","password":"password123"}')

TOKEN_SARAH_B=$(echo $LOGIN_SARAH_B | jq -r '.token')
echo "5. Sarah logged in again (new session)"

# Access cart explicitly using cartId from Session A
GET_CART_B=$(curl -s -X GET "$BASE_URL/cart/$CART_ID" \
  -H "Authorization: Bearer $TOKEN_SARAH_B")

echo "6. Retrieved cart explicitly: /cart/$CART_ID"
echo "   Items: $(echo $GET_CART_B | jq -r '.items | length')"
echo "   Cart owner: $(echo $GET_CART_B | jq -r '.userId')"

# Session A: Sarah continues with implicit access
echo -e "\n=== SESSION A CONTINUED: Sarah (Back to Implicit) ==="
# Set address (implicit) - triggers warehouse call
SET_ADDRESS_A=$(curl -s -X PUT "$BASE_URL/cart/address" \
  -H "Authorization: Bearer $TOKEN_SARAH" \
  -H "Content-Type: application/json" \
  -d '{"street":"789 Elm St","city":"Austin","state":"TX","zip":"73301"}')

echo "7. Set address (implicit)"
echo "   Warehouse assignments: $(echo $SET_ADDRESS_A | jq -r '.warehouseAssignments | length')"

# Session B: Access via explicit ID again
echo -e "\n=== SESSION B CONTINUED: Sarah (Explicit Access Again) ==="
GET_CART_B2=$(curl -s -X GET "$BASE_URL/cart/$CART_ID" \
  -H "Authorization: Bearer $TOKEN_SARAH_B")

echo "8. Retrieved cart explicitly again: /cart/$CART_ID"
echo "   Has address: $(echo $GET_CART_B2 | jq -r '.address != null')"
echo "   Warehouse assignments: $(echo $GET_CART_B2 | jq -r '.warehouseAssignments | length')"

# Session C: Different user (Alex) creates their own cart
echo -e "\n=== SESSION C: Alex (Different User) ==="
LOGIN_ALEX=$(curl -s -X POST "$BASE_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"alex.rodriguez@example.com","password":"password123"}')

TOKEN_ALEX=$(echo $LOGIN_ALEX | jq -r '.token')
echo "9. Logged in as Alex"

# Create Alex's cart
ADD_ITEM_C=$(curl -s -X POST "$BASE_URL/cart/items" \
  -H "Authorization: Bearer $TOKEN_ALEX" \
  -H "Content-Type: application/json" \
  -d '{"itemId":"phone-999","name":"Smartphone","quantity":1,"price":899.99}')

CART_ID_ALEX=$(echo $ADD_ITEM_C | jq -r '.cartId')
echo "10. Created Alex's cart: $CART_ID_ALEX"

# Alex accesses Sarah's cart explicitly
echo -e "\n11. Alex tries to access Sarah's cart explicitly"
GET_SARAH_CART=$(curl -s -X GET "$BASE_URL/cart/$CART_ID" \
  -H "Authorization: Bearer $TOKEN_ALEX")

echo "    Accessed cart: $(echo $GET_SARAH_CART | jq -r '.id')"
echo "    Owner: $(echo $GET_SARAH_CART | jq -r '.userId') (not Alex!)"
echo "    Items: $(echo $GET_SARAH_CART | jq -r '.items | length')"

# Alex accesses his own cart implicitly
GET_CART_ALEX=$(curl -s -X GET "$BASE_URL/cart" \
  -H "Authorization: Bearer $TOKEN_ALEX")

echo -e "\n12. Alex retrieves his own cart (implicit)"
echo "    Cart ID: $(echo $GET_CART_ALEX | jq -r '.id')"
echo "    Items: $(echo $GET_CART_ALEX | jq -r '.items | length')"

echo -e "\n========================================================="
echo "Cross-session cart access test completed!"
echo ""
echo "Carts involved:"
echo "  Sarah's cart: $CART_ID"
echo "  Alex's cart:  $CART_ID_ALEX"
echo ""
echo "Access patterns demonstrated:"
echo "  ✓ Session A: Implicit creation + implicit operations"
echo "  ✓ Session B: Explicit access to Session A's cart (same user, different token)"
echo "  ✓ Mixed: Alternating implicit and explicit access"
echo "  ✓ Cross-user: Different user accessing cart via explicit ID"
echo ""
echo "Key observations for Smart Replace:"
echo "  - Same cartId accessed via implicit (session) AND explicit (URL) patterns"
echo "  - Multiple JWT tokens for same user (session isolation)"
echo "  - CartId appears in: URL paths, warehouse request bodies, warehouse responses"
echo "  - Timestamps change with each request (createdAt, updatedAt, assignedAt)"
echo "  - Multiple carts with different IDs must be tracked independently"
echo ""
echo "Expected replay failures WITHOUT transforms:"
echo "  ❌ Sarah's cartId mismatch in URL: /cart/cart-abc vs /cart/cart-xyz"
echo "  ❌ Alex's cartId mismatch in URL: /cart/cart-def vs /cart/cart-uvw"
echo "  ❌ Warehouse request signatures mismatch (different cartIds in bodies)"
echo "  ❌ Warehouse response signatures mismatch (cartId + timestamp)"
echo "  ❌ Session → cartId mapping differs between recording and replay"
echo ""
echo "Required transforms for successful replay:"
echo "  ✓ smart_replace: Track Sarah's cartId (original → replay)"
echo "  ✓ smart_replace: Track Alex's cartId (original → replay)"
echo "  ✓ URL path rewriting: Replace {cartId} in /cart/{cartId} for BOTH carts"
echo "  ✓ json_path: Replace cartId in warehouse request bodies"
echo "  ✓ json_path: Replace cartId in warehouse response bodies"
echo "  ✓ scrub: Normalize all timestamps (createdAt, updatedAt, assignedAt, estimatedDelivery)"
echo ""
echo "This scenario tests Smart Replace's ability to:"
echo "  1. Track multiple independent dynamic IDs simultaneously"
echo "  2. Handle same ID accessed via different patterns (implicit + explicit)"
echo "  3. Maintain ID consistency across service boundaries (cart → warehouse)"
echo "  4. Detect and suggest appropriate transforms automatically"
