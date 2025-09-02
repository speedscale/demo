#!/bin/bash

# Smart Replace Demo Test Scenarios
# This script demonstrates the 3 smart replace use cases

BASE_URL="http://localhost:8080"

echo "=== Smart Replace Demo Test Scenarios ==="
echo

# Step 1: Login both users first
echo "Step 1a: Login as UserA (Sarah)"
LOGIN_A=$(curl -s -X POST $BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"sarah.martinez@example.com","password":"password123"}')

TOKEN_A=$(echo $LOGIN_A | grep -o '"token":"[^"]*' | cut -d'"' -f4)
USER_A=$(echo $LOGIN_A | grep -o '"userId":"[^"]*' | cut -d'"' -f4)

echo "   - Got token: ${TOKEN_A:0:20}..."
echo "   - User ID: $USER_A"
echo

echo "Step 1b: Login as UserB (David)"
LOGIN_B=$(curl -s -X POST $BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"david.kim@example.com","password":"password123"}')

TOKEN_B=$(echo $LOGIN_B | grep -o '"token":"[^"]*' | cut -d'"' -f4)
USER_B=$(echo $LOGIN_B | grep -o '"userId":"[^"]*' | cut -d'"' -f4)

echo "   - Got token: ${TOKEN_B:0:20}..."
echo "   - User ID: $USER_B"
echo

# Step 2: Use tokens for various operations
echo "Step 2a: UserA gets their profile (JWT token replacement demo)"
curl -s -X GET $BASE_URL/users/$USER_A \
  -H "Authorization: Bearer $TOKEN_A" | jq .
echo

echo "Step 2b: UserB gets their profile (shows different JWT tokens)"
curl -s -X GET $BASE_URL/users/$USER_B \
  -H "Authorization: Bearer $TOKEN_B" | jq .
echo

echo "Step 3a: UserA creates an order (dynamic order ID demo)"
ORDER_A=$(curl -s -X POST $BASE_URL/orders \
  -H "Authorization: Bearer $TOKEN_A" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"product": "Widget", "quantity": 2, "price": 10.99},
      {"product": "Gadget", "quantity": 1, "price": 24.99}
    ],
    "totalAmount": 46.97
  }')

ORDER_A_ID=$(echo $ORDER_A | grep -o '"orderId":"[^"]*' | cut -d'"' -f4)
echo "   - Created order: $ORDER_A_ID"

echo "Step 3b: UserB creates an order (another dynamic order ID)"
ORDER_B=$(curl -s -X POST $BASE_URL/orders \
  -H "Authorization: Bearer $TOKEN_B" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"product": "Laptop", "quantity": 1, "price": 999.99},
      {"product": "Mouse", "quantity": 2, "price": 15.99}
    ],
    "totalAmount": 1031.97
  }')

ORDER_B_ID=$(echo $ORDER_B | grep -o '"orderId":"[^"]*' | cut -d'"' -f4)
echo "   - Created order: $ORDER_B_ID"
echo

# Step 4: Retrieve orders
echo "Step 4a: UserA retrieves their order"
curl -s -X GET "$BASE_URL/orders?orderId=$ORDER_A_ID" \
  -H "Authorization: Bearer $TOKEN_A" | jq .
echo

echo "Step 4b: UserB retrieves their order"
curl -s -X GET "$BASE_URL/orders?orderId=$ORDER_B_ID" \
  -H "Authorization: Bearer $TOKEN_B" | jq .

echo
echo "=== Test Scenarios Complete ==="
echo "These requests demonstrate:"
echo "1. JWT tokens that change between sessions (smart_replace)"
echo "2. User IDs that need bulk replacement (smart_replace_csv)"
echo "3. Dynamic order IDs that change at runtime (smart_replace_recorded)"