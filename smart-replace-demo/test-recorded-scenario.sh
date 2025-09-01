#!/bin/bash

# Smart Replace Demo - Recorded Dynamic ID Scenario
# Demonstrates smart_replace_recorded for dynamic order IDs

BASE_URL="${1:-http://localhost:8080}"

echo "Using BASE_URL: $BASE_URL"

echo "=== Dynamic Order ID Smart Replace Scenario ==="
echo "Demonstrates smart_replace_recorded for dynamic order IDs"
echo "Two users creating orders - IDs must be tracked correctly"
echo

# User A: Create and retrieve order
echo "Step 1a: UserA (Sarah) creates order"
LOGIN_A=$(curl -s -X POST $BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"sarah.martinez@example.com","password":"password123"}')

TOKEN_A=$(echo $LOGIN_A | grep -o '"token":"[^"]*' | cut -d'"' -f4)
USER_A=$(echo $LOGIN_A | grep -o '"userId":"[^"]*' | cut -d'"' -f4)

echo "   - Logged in as: $USER_A"

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
echo

# User B: Create and retrieve order  
echo "Step 1b: UserB (David) creates order"
LOGIN_B=$(curl -s -X POST $BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"david.kim@example.com","password":"password123"}')

TOKEN_B=$(echo $LOGIN_B | grep -o '"token":"[^"]*' | cut -d'"' -f4)
USER_B=$(echo $LOGIN_B | grep -o '"userId":"[^"]*' | cut -d'"' -f4)

echo "   - Logged in as: $USER_B"

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

# Step 2: Retrieve orders
echo "Step 2a: UserA retrieves their order"
curl -s -X GET $BASE_URL/orders/$ORDER_A_ID \
  -H "Authorization: Bearer $TOKEN_A" | jq .
echo

echo "Step 2b: UserB retrieves their order"
curl -s -X GET $BASE_URL/orders/$ORDER_B_ID \
  -H "Authorization: Bearer $TOKEN_B" | jq .

echo
echo "=== Recorded Scenario Complete ==="
echo "This demonstrates dynamic order IDs that change at runtime (smart_replace_recorded)"