# JWT Generation Scripts

This directory contains scripts to generate JWT tokens for the java-auth service without calling the API.

## Bash Script (generate-jwt.sh)

Quick and simple shell script that uses OpenSSL to generate JWT tokens.

### Usage:
```bash
./generate-jwt.sh <username> [jwt_secret] [expiration_minutes]

# Examples:
./generate-jwt.sh admin
./generate-jwt.sh admin your-secret-key 60
./generate-jwt.sh testuser production-secret 120
```

### Requirements:
- Bash
- OpenSSL
- Base64 command

## Java Application (JwtGenerator.java)

Standalone Java application that uses the same JWT library as the auth service.

### Building:
```bash
# Using Maven (recommended)
mvn clean package

# Or compile manually
javac -cp ".:jjwt-api-0.12.3.jar:jjwt-impl-0.12.3.jar:jjwt-jackson-0.12.3.jar:jackson-databind-2.15.2.jar:jackson-core-2.15.2.jar:jackson-annotations-2.15.2.jar" JwtGenerator.java
```

### Running:
```bash
# If built with Maven
java -jar target/jwt-generator-1.0.0.jar <username> [jwt_secret] [expiration_ms]

# If compiled manually
java -cp ".:jjwt-api-0.12.3.jar:jjwt-impl-0.12.3.jar:jjwt-jackson-0.12.3.jar:jackson-databind-2.15.2.jar:jackson-core-2.15.2.jar:jackson-annotations-2.15.2.jar" JwtGenerator <username> [jwt_secret] [expiration_ms]

# Examples:
java -jar target/jwt-generator-1.0.0.jar admin
java -jar target/jwt-generator-1.0.0.jar admin your-secret-key 3600000
java -jar target/jwt-generator-1.0.0.jar testuser production-secret 7200000
```

### Parameters:
- `username`: Required. The username to include in the JWT subject claim
- `jwt_secret`: Optional. The secret key for signing (default: your-secret-key-here-please-change-in-production)
- `expiration`: Optional. Token expiration time
  - Bash script: in minutes (default: 60)
  - Java app: in milliseconds (default: 3600000 = 1 hour)

## Environment Variables

Both scripts use the same defaults as the auth service:
- Default secret: `your-secret-key-here-please-change-in-production`
- Default expiration: 1 hour

For production use, ensure you use the same JWT secret configured in your auth service.

## Verification

Both scripts output a curl command you can use to verify the generated token:
```bash
curl -X POST http://localhost:8080/api/auth/validate \
  -H 'Content-Type: application/json' \
  -d '{"token":"<generated-token>"}'
```