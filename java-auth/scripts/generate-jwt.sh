#!/bin/bash

# JWT Token Generator Script
# This script generates JWT tokens for the java-auth service without calling the API

# Check if username is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <username> [jwt_secret] [expiration_minutes]"
    echo "Example: $0 admin"
    echo "Example: $0 admin your-secret-key 60"
    exit 1
fi

USERNAME="$1"
JWT_SECRET="${2:-your-secret-key-here-please-change-in-production}"
EXPIRATION_MINUTES="${3:-60}"

# Calculate expiration time in milliseconds
CURRENT_TIME_MS=$(date +%s000)
EXPIRATION_MS=$((EXPIRATION_MINUTES * 60 * 1000))
EXP_TIME_MS=$((CURRENT_TIME_MS + EXPIRATION_MS))

# Convert times to seconds for JWT
IAT=$((CURRENT_TIME_MS / 1000))
EXP=$((EXP_TIME_MS / 1000))

# Create header
HEADER=$(echo -n '{"alg":"HS256","typ":"JWT"}' | base64 | tr -d '=' | tr '/+' '_-' | tr -d '\n')

# Create payload
PAYLOAD=$(echo -n "{\"sub\":\"$USERNAME\",\"iat\":$IAT,\"exp\":$EXP}" | base64 | tr -d '=' | tr '/+' '_-' | tr -d '\n')

# Create signature
SIGNATURE=$(echo -n "${HEADER}.${PAYLOAD}" | openssl dgst -sha256 -hmac "$JWT_SECRET" -binary | base64 | tr -d '=' | tr '/+' '_-' | tr -d '\n')

# Combine to create JWT
JWT="${HEADER}.${PAYLOAD}.${SIGNATURE}"

echo "Generated JWT token for user: $USERNAME"
echo "Secret used: $JWT_SECRET"
echo "Valid for: $EXPIRATION_MINUTES minutes"
echo ""
echo "Token:"
echo "$JWT"
echo ""
echo "To verify this token, you can use:"
echo "curl -X POST http://localhost:8080/api/auth/validate -H 'Content-Type: application/json' -d '{\"token\":\"$JWT\"}'"