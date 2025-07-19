#!/bin/bash

# Banking API Gateway End-to-End Test Script

set -e

API_GATEWAY_URL="http://localhost:8080"
echo "=== Banking API Gateway End-to-End Test ==="
echo "API Gateway URL: $API_GATEWAY_URL"
echo ""

echo "Waiting for API Gateway to be ready..."
sleep 15

# Test 1: Health checks
echo "=== 1. Health Check Tests ==="
echo "Testing: User Service Health"
curl -s -X GET "$API_GATEWAY_URL/api/user-service/health"
echo ""

echo "Testing: Accounts Service Health"
curl -s -X GET "$API_GATEWAY_URL/api/accounts-service/health"
echo ""

echo "Testing: Transactions Service Health"
curl -s -X GET "$API_GATEWAY_URL/api/transactions-service/health"
echo ""

# Test 2: User Registration
echo "=== 2. User Registration Test ==="
TIMESTAMP=$(date +%s)
USERNAME="testuser_$TIMESTAMP"
EMAIL="test$TIMESTAMP@example.com"

echo "Testing: User Registration for $USERNAME"
REGISTER_RESPONSE=$(curl -s -X POST "$API_GATEWAY_URL/api/user-service/register" \
    -H 'Content-Type: application/json' \
    -d '{
        "username": "'$USERNAME'",
        "email": "'$EMAIL'",
        "password": "Password123"
    }')

echo "Response: $REGISTER_RESPONSE"

# Check if registration was successful
if echo "$REGISTER_RESPONSE" | grep -q '"id"'; then
    echo "✓ User registration successful: $USERNAME"
else
    echo "✗ User registration failed"
    exit 1
fi
echo ""

# Test 3: User Login
echo "=== 3. User Login Test ==="
echo "Testing: User Login for $USERNAME"
LOGIN_RESPONSE=$(curl -s -X POST "$API_GATEWAY_URL/api/user-service/login" \
    -H 'Content-Type: application/json' \
    -d '{
        "usernameOrEmail": "'$USERNAME'",
        "password": "Password123"
    }')

echo "Response: $LOGIN_RESPONSE"

# Extract JWT token from login response using grep and sed
JWT_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"token":"[^"]*"' | sed 's/"token":"//g' | sed 's/"//g')
if [[ -z "$JWT_TOKEN" ]]; then
    echo "✗ Could not extract JWT token from login response"
    exit 1
fi
echo "✓ JWT Token obtained: ${JWT_TOKEN:0:50}..."
echo ""

# Test 4: Get User Profile (Protected endpoint)
echo "=== 4. User Profile Test (Protected) ==="
echo "Testing: Get User Profile"
PROFILE_RESPONSE=$(curl -s -X GET "$API_GATEWAY_URL/api/user-service/profile" \
    -H "Authorization: Bearer $JWT_TOKEN")

echo "Response: $PROFILE_RESPONSE"
if echo "$PROFILE_RESPONSE" | grep -q '"success":true'; then
    echo "✓ User profile retrieved successfully"
else
    echo "✗ User profile retrieval failed"
    exit 1
fi
echo ""

# Test 5: Create Account (Protected endpoint)
echo "=== 5. Create Account Test (Protected) ==="
echo "Testing: Create Account"
ACCOUNT_RESPONSE=$(curl -s -X POST "$API_GATEWAY_URL/api/accounts-service" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H 'Content-Type: application/json' \
    -d '{
        "accountType": "CHECKING"
    }')

echo "Response: $ACCOUNT_RESPONSE"

# Check if account creation was successful and extract account ID
if echo "$ACCOUNT_RESPONSE" | grep -q '"accountNumber"'; then
    echo "✓ Account creation successful"
    ACCOUNT_ID=$(echo "$ACCOUNT_RESPONSE" | grep -o '"id":[0-9]*' | sed 's/"id"://g')
    echo "Account ID: $ACCOUNT_ID"
elif echo "$ACCOUNT_RESPONSE" | grep -q '"success":true'; then
    echo "✓ Account creation successful"
    ACCOUNT_ID=$(echo "$ACCOUNT_RESPONSE" | grep -o '"id":[0-9]*' | sed 's/"id"://g')
    echo "Account ID: $ACCOUNT_ID"
else
    echo "✗ Account creation failed"
    ACCOUNT_ID=""
fi
echo ""

# Test 6: Get Account Details (if account was created)
if [[ -n "$ACCOUNT_ID" ]]; then
    echo "=== 6. Get Account Details Test (Protected) ==="
    echo "Testing: Get Account Details for Account ID: $ACCOUNT_ID"
    ACCOUNT_DETAILS_RESPONSE=$(curl -s -X GET "$API_GATEWAY_URL/api/accounts-service/$ACCOUNT_ID" \
        -H "Authorization: Bearer $JWT_TOKEN")
    
    echo "Response: $ACCOUNT_DETAILS_RESPONSE"
    if echo "$ACCOUNT_DETAILS_RESPONSE" | grep -q '"accountNumber"' || echo "$ACCOUNT_DETAILS_RESPONSE" | grep -q '"success":true'; then
        echo "✓ Account details retrieved successfully"
    else
        echo "✗ Account details retrieval failed"
    fi
    echo ""
    
    # Test 7: Create Transaction (Deposit)
    echo "=== 7. Create Transaction Test (Protected) ==="
    echo "Testing: Create Deposit Transaction"
    TRANSACTION_RESPONSE=$(curl -s -X POST "$API_GATEWAY_URL/api/transactions-service/deposit" \
        -H "Authorization: Bearer $JWT_TOKEN" \
        -H 'Content-Type: application/json' \
        -d '{
            "accountId": '$ACCOUNT_ID',
            "amount": 50.00
        }')
    
    echo "Response: $TRANSACTION_RESPONSE"
    if echo "$TRANSACTION_RESPONSE" | grep -q '"transactionType"' || echo "$TRANSACTION_RESPONSE" | grep -q '"id"' || echo "$TRANSACTION_RESPONSE" | grep -q '"success":true'; then
        echo "✓ Transaction created successfully"
    else
        echo "✗ Transaction creation failed"
    fi
    echo ""
    
    # Test 8: Get User Transactions
    echo "=== 8. Get User Transactions Test (Protected) ==="
    echo "Testing: Get User Transactions"
    TRANSACTIONS_RESPONSE=$(curl -s -X GET "$API_GATEWAY_URL/api/transactions-service" \
        -H "Authorization: Bearer $JWT_TOKEN")
    
    echo "Response: $TRANSACTIONS_RESPONSE"
    if echo "$TRANSACTIONS_RESPONSE" | grep -q '"type"' || echo "$TRANSACTIONS_RESPONSE" | grep -q '"success":true' || echo "$TRANSACTIONS_RESPONSE" | grep -q '\[\]'; then
        echo "✓ User transactions retrieved successfully"
    else
        echo "✗ User transactions retrieval failed"
    fi
    echo ""
else
    echo "⚠ Skipping account-related tests due to account creation failure"
fi

# Test 9: Unauthorized Access Test
echo "=== 9. Unauthorized Access Test ==="
echo "Testing: Access Protected Endpoint Without Token (Should Fail)"
UNAUTHORIZED_RESPONSE=$(curl -s -X GET "$API_GATEWAY_URL/api/user-service/profile")

echo "Response: $UNAUTHORIZED_RESPONSE"
if echo "$UNAUTHORIZED_RESPONSE" | grep -q '"error":"Unauthorized"'; then
    echo "✓ Unauthorized access properly blocked"
else
    echo "✗ Unauthorized access not properly blocked"
fi
echo ""

echo "=== Test Summary ==="
echo "✓ All tests completed!"
echo "Username: $USERNAME"
echo "JWT Token: ${JWT_TOKEN:0:50}..."
if [[ -n "$ACCOUNT_ID" ]]; then
    echo "Account ID: $ACCOUNT_ID"
fi
echo "=== End of Tests ==="