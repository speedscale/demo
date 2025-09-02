#!/bin/bash

# Smart Replace Demo - JWT Token Scenario
# Demonstrates smart_replace for JWT tokens that change between sessions

BASE_URL="${1:-http://localhost:8080}"

echo "Using BASE_URL: $BASE_URL"

echo "=== JWT Token Smart Replace Scenario ==="
echo "Demonstrates why smart_replace is needed for JWT tokens"
echo "Without smart_replace, dumb substitution would use wrong tokens"
echo

# Function to decode JWT and show details
decode_jwt() {
  local token=$1
  local label=$2
  
  JWT_PAYLOAD=$(echo $token | cut -d'.' -f2)
  JWT_PAYLOAD="${JWT_PAYLOAD}$(printf '%*s' $((4 - ${#JWT_PAYLOAD} % 4)) '' | tr ' ' '=')"
  DECODED=$(echo $JWT_PAYLOAD | base64 -d 2>/dev/null)
  
  if [ $? -eq 0 ]; then
    ISSUED_AT=$(echo $DECODED | grep -o '"iat":[0-9]*' | cut -d':' -f2)
    EXPIRES_AT=$(echo $DECODED | grep -o '"exp":[0-9]*' | cut -d':' -f2)
    USER_EMAIL=$(echo $DECODED | grep -o '"email":"[^"]*' | cut -d'"' -f4)
    
    if [ ! -z "$ISSUED_AT" ] && [ ! -z "$EXPIRES_AT" ]; then
      echo "   - $label Token: ${token:0:20}..."
      echo "   - For user: $USER_EMAIL"
      echo "   - Issued at: $(date -r $ISSUED_AT '+%H:%M:%S')"
      echo "   - Expires at: $(date -r $EXPIRES_AT '+%H:%M:%S')"
    fi
  fi
}

# Step 1: Login as UserA
echo "Step 1a: Login as UserA (Sarah)"
LOGIN_A=$(curl -s -X POST $BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"sarah.martinez@example.com","password":"password123"}')

TOKEN_A=$(echo $LOGIN_A | grep -o '"token":"[^"]*' | cut -d'"' -f4)
USER_A=$(echo $LOGIN_A | grep -o '"userId":"[^"]*' | cut -d'"' -f4)

decode_jwt "$TOKEN_A" "UserA"
echo

# Step 1b: Login as UserB  
echo "Step 1b: Login as UserB (David)"
LOGIN_B=$(curl -s -X POST $BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"david.kim@example.com","password":"password123"}')

TOKEN_B=$(echo $LOGIN_B | grep -o '"token":"[^"]*' | cut -d'"' -f4)
USER_B=$(echo $LOGIN_B | grep -o '"userId":"[^"]*' | cut -d'"' -f4)

decode_jwt "$TOKEN_B" "UserB"
echo

# Step 2: Use tokens to access profiles
echo "Step 2a: UserA accesses their profile with TokenA"
curl -s -X GET $BASE_URL/users/me \
  -H "Authorization: Bearer $TOKEN_A" | jq .
echo

echo "Step 2b: UserB accesses their profile with TokenB"
curl -s -X GET $BASE_URL/users/me \
  -H "Authorization: Bearer $TOKEN_B" | jq .

echo
echo "=== JWT Scenario Complete ==="
echo "This demonstrates JWT tokens that change between sessions (smart_replace)"