#!/bin/bash

# Smart Replace Demo Test Scenarios
# This script demonstrates the 3 smart replace use cases

BASE_URL="http://localhost:8080"
TOKEN=""

echo "=== Smart Replace Demo Test Scenarios ==="
echo

# Scenario 1: Smart Replace - JWT Token
echo "1. Testing JWT token replacement (smart_replace)"
echo "   - Login to get JWT token"

# Login
LOGIN_RESPONSE=$(curl -s -X POST $BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"sarah.martinez@example.com","password":"password123"}')

TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)
USER_ID=$(echo $LOGIN_RESPONSE | grep -o '"userId":"[^"]*' | cut -d'"' -f4)

echo "   - Got token: ${TOKEN:0:20}..."
echo "   - User ID: $USER_ID"

# Use token to get profile
echo "   - Getting user profile with token"
curl -s -X GET $BASE_URL/users/$USER_ID \
  -H "Authorization: Bearer $TOKEN" | jq .

echo
echo "2. Testing bulk user ID replacement (smart_replace_csv)"
echo "   - Would normally export user IDs to CSV and map to test IDs"
echo "   - Example CSV:"
echo "     sarah-martinez,test-sarah-martinez"
echo "     david-kim,test-david-kim"
echo "     emma-thompson,test-emma-thompson"

echo
echo "3. Testing dynamic order ID replacement (smart_replace_recorded)"
echo "   - Creating new order"

# Create order
ORDER_RESPONSE=$(curl -s -X POST $BASE_URL/orders \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "items": [
      {"product": "Widget", "quantity": 2, "price": 10.99},
      {"product": "Gadget", "quantity": 1, "price": 24.99}
    ],
    "totalAmount": 46.97
  }')

ORDER_ID=$(echo $ORDER_RESPONSE | grep -o '"orderId":"[^"]*' | cut -d'"' -f4)
echo "   - Created order: $ORDER_ID"

# Get order details
echo "   - Getting order details"
curl -s -X GET $BASE_URL/orders/$ORDER_ID \
  -H "Authorization: Bearer $TOKEN" | jq .

echo
echo "=== Test Scenarios Complete ==="
echo "These requests demonstrate:"
echo "1. JWT tokens that change between sessions (smart_replace)"
echo "2. User IDs that need bulk replacement (smart_replace_csv)"
echo "3. Dynamic order IDs that change at runtime (smart_replace_recorded)"