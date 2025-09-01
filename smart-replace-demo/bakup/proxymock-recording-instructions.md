# Recording Traffic with Proxymock for Smart Replace Demo

This guide shows how to record traffic from our demo app using proxymock to demonstrate Smart Replace features.

## Prerequisites

1. Demo server running on port 8080
2. Proxymock installed and configured
3. Output directory created

## Recording Steps

### 1. Start the Demo Server

```bash
cd smart-replace-demo
npm install
npm start
```

### 2. Start Proxymock Recording

```bash
# Start recording traffic
proxymock record
```

### 3. Run Test Scenarios Through Proxy

```bash
# Set base URL to proxy
BASE_URL="http://localhost:4143"

# Scenario 1: JWT Token Flow
echo "=== Recording JWT Token Scenario ==="

# Login as John Doe
LOGIN_RESP=$(curl -s -X POST $BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"sarah.martinez@example.com","password":"password123"}')

TOKEN=$(echo $LOGIN_RESP | jq -r '.token')
USER_ID=$(echo $LOGIN_RESP | jq -r '.userId')

# Use token to get profile
curl -s -X GET $BASE_URL/users/$USER_ID \
  -H "Authorization: Bearer $TOKEN"

# Scenario 2: Multiple User Access (for CSV demo)
echo "=== Recording Multiple User Access ==="

# Login as different users
for email in "jane.smith@example.com" "bob.wilson@example.com" "alice.chen@example.com"; do
  LOGIN_RESP=$(curl -s -X POST $BASE_URL/auth/login \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"password123\"}")
  
  TOKEN=$(echo $LOGIN_RESP | jq -r '.token')
  USER_ID=$(echo $LOGIN_RESP | jq -r '.userId')
  
  # Access their profiles
  curl -s -X GET $BASE_URL/users/$USER_ID \
    -H "Authorization: Bearer $TOKEN"
done

# Scenario 3: Order Creation Flow
echo "=== Recording Order Creation Flow ==="

# Create orders with different users
LOGIN_RESP=$(curl -s -X POST $BASE_URL/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"sarah.martinez@example.com","password":"password123"}')

TOKEN=$(echo $LOGIN_RESP | jq -r '.token')

# Create multiple orders
for i in {1..3}; do
  ORDER_RESP=$(curl -s -X POST $BASE_URL/orders \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d "{
      \"items\": [
        {\"product\": \"Widget-$i\", \"quantity\": $i, \"price\": 10.99},
        {\"product\": \"Gadget-$i\", \"quantity\": 1, \"price\": 24.99}
      ],
      \"totalAmount\": $((10.99 * i + 24.99))
    }")
  
  ORDER_ID=$(echo $ORDER_RESP | jq -r '.orderId')
  
  # Retrieve order
  curl -s -X GET $BASE_URL/orders/$ORDER_ID \
    -H "Authorization: Bearer $TOKEN"
done
```

### 4. Stop Recording

```bash
speedctl record traffic stop
```

## Expected Recording Output

You should see RRPairs for:

1. **JWT Scenario**:
   - POST /auth/login (returns JWT)
   - GET /users/:userId (uses JWT)

2. **CSV Scenario**:
   - Multiple login requests with different users
   - Profile accesses with different user IDs

3. **Recorded Scenario**:
   - POST /orders (returns dynamic order ID)
   - GET /orders/:orderId (uses that order ID)

## Applying Smart Replace Transforms

### For JWT Tokens (smart_replace)

```json
{
  "filters": {
    "location": "/auth/login"
  },
  "extractors": [{
    "type": "res_body"
  }],
  "transforms": [{
    "type": "json_path",
    "config": {"path": "$.token"}
  }, {
    "type": "smart_replace"
  }]
}
```

### For User IDs (smart_replace_csv)

1. Extract user IDs:
```bash
speedctl extract data <snapshot-id> \
  --path "http.res.bodyJSON.userId" \
  --output extracted-users.csv
```

2. Add test mappings and upload:
```bash
speedctl push userdata user-mappings.csv
```

3. Apply transform:
```json
{
  "extractors": [{
    "type": "file",
    "config": {"path": "s3://user-mappings.csv"}
  }],
  "transforms": [{
    "type": "smart_replace_csv",
    "config": {"headers": "true"}
  }]
}
```

### For Order IDs (smart_replace_recorded)

```json
{
  "filters": {
    "location": "/orders",
    "command": "POST"
  },
  "extractors": [{
    "type": "res_body"
  }],
  "transforms": [{
    "type": "json_path",
    "config": {"path": "$.orderId"}
  }, {
    "type": "smart_replace_recorded"
  }]
}
```

## Verification

After applying transforms and running replay:

1. JWT tokens should be automatically updated
2. User IDs should map to test environment IDs
3. Order IDs should maintain POST/GET relationships

## Tips

- Record multiple scenarios to show different use cases
- Include both successful and error cases
- Vary the data to demonstrate flexibility
- Keep recordings focused on specific features