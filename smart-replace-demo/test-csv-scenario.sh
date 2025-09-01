#!/bin/bash

# Smart Replace Demo - CSV Bulk Replacement Scenario  
# Demonstrates smart_replace_csv for bulk user ID mapping

BASE_URL="${1:-http://localhost:8080}"

echo "Using BASE_URL: $BASE_URL"

echo "=== CSV Bulk User ID Smart Replace Scenario ==="
echo "2. Testing bulk user ID replacement (smart_replace_csv)"
echo "   - Demonstrating multiple user access patterns"
echo "   - Uses CSV mapping: sarah-martinez,test-sarah-martinez"

# Login as different users to demonstrate bulk replacement
USERS=("sarah.martinez@example.com" "david.kim@example.com" "emma.thompson@example.com")

for email in "${USERS[@]}"; do
  echo "   - Testing user: $email"
  
  LOGIN_RESPONSE=$(curl -s -X POST $BASE_URL/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"password123\"}")
  
  TOKEN=$(echo $LOGIN_RESPONSE | grep -o '"token":"[^"]*' | cut -d'"' -f4)
  USER_ID=$(echo $LOGIN_RESPONSE | grep -o '"userId":"[^"]*' | cut -d'"' -f4)
  
  echo "     - User ID: $USER_ID"
  
  # Get user profile
  curl -s -X GET $BASE_URL/users/me \
    -H "Authorization: Bearer $TOKEN" | jq .
  
  echo
done

echo "=== CSV Scenario Complete ==="
echo "This demonstrates user IDs that need bulk replacement (smart_replace_csv)"
echo "CSV mapping file: demo-users.csv"