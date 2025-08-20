# Java Authentication Microservice Plan

## Project Overview
A Spring Boot microservice for user authentication with JWT token-based authentication, backed by MySQL database.

## Technology Stack
- **Framework**: Spring Boot 3.x
- **Language**: Java 17+
- **Database**: MySQL 8.0
- **Authentication**: JWT (JSON Web Tokens)
- **Build Tool**: Maven
- **Testing**: JUnit 5

## Project Structure
```
java-auth/
├── src/
│   ├── main/
│   │   ├── java/com/example/auth/
│   │   │   ├── controller/
│   │   │   │   └── AuthController.java
│   │   │   ├── service/
│   │   │   │   ├── AuthService.java
│   │   │   │   ├── TokenService.java
│   │   │   │   └── AuditService.java
│   │   │   ├── repository/
│   │   │   │   ├── UserRepository.java
│   │   │   │   └── AuditLogRepository.java
│   │   │   ├── model/
│   │   │   │   ├── User.java
│   │   │   │   ├── RefreshToken.java
│   │   │   │   └── AuditLog.java
│   │   │   ├── dto/
│   │   │   │   ├── LoginRequest.java
│   │   │   │   ├── LoginResponse.java
│   │   │   │   ├── TokenValidationRequest.java
│   │   │   │   └── TokenRefreshRequest.java
│   │   │   ├── security/
│   │   │   │   ├── JwtTokenProvider.java
│   │   │   │   └── SecurityConfig.java
│   │   │   ├── exception/
│   │   │   │   ├── InvalidTokenException.java
│   │   │   │   └── GlobalExceptionHandler.java
│   │   │   └── AuthApplication.java
│   │   └── resources/
│   │       ├── application.yml
│   │       └── db/migration/
│   │           └── V1__create_users_table.sql
│   └── test/
│       └── java/com/example/auth/
│           ├── controller/
│           │   └── AuthControllerTest.java
│           └── service/
│               └── AuthServiceTest.java
├── pom.xml
├── Dockerfile
├── docker-compose.yml
└── README.md
```

## API Endpoints

### 1. Login Endpoint
- **URL**: `POST /api/auth/login`
- **Request Body**:
  ```json
  {
    "username": "string",
    "password": "string"
  }
  ```
- **Response**:
  ```json
  {
    "accessToken": "string",
    "refreshToken": "string",
    "tokenType": "Bearer",
    "expiresIn": 3600
  }
  ```

### 2. Validate Token Endpoint
- **URL**: `POST /api/auth/validate`
- **Request Body**:
  ```json
  {
    "token": "string"
  }
  ```
- **Response**:
  ```json
  {
    "valid": true,
    "username": "string",
    "expiresAt": "2024-01-01T00:00:00Z"
  }
  ```

### 3. Refresh Token Endpoint
- **URL**: `POST /api/auth/refresh`
- **Request Body**:
  ```json
  {
    "refreshToken": "string"
  }
  ```
- **Response**:
  ```json
  {
    "accessToken": "string",
    "refreshToken": "string",
    "tokenType": "Bearer",
    "expiresIn": 3600
  }
  ```

## Database Schema

### Users Table
```sql
CREATE TABLE users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    enabled BOOLEAN DEFAULT TRUE
);

CREATE INDEX idx_username ON users(username);
CREATE INDEX idx_email ON users(email);
```

### Refresh Tokens Table
```sql
CREATE TABLE refresh_tokens (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    token VARCHAR(255) UNIQUE NOT NULL,
    user_id BIGINT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_token ON refresh_tokens(token);
CREATE INDEX idx_user_id ON refresh_tokens(user_id);
```

### Audit Log Table
```sql
CREATE TABLE audit_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT,
    username VARCHAR(50),
    event_type VARCHAR(50) NOT NULL,
    event_status VARCHAR(20) NOT NULL,
    ip_address VARCHAR(45),
    user_agent VARCHAR(255),
    details JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_user_id_audit ON audit_logs(user_id);
CREATE INDEX idx_event_type ON audit_logs(event_type);
CREATE INDEX idx_created_at ON audit_logs(created_at);
CREATE INDEX idx_event_status ON audit_logs(event_status);
```

### Audit Event Types
- `LOGIN_ATTEMPT` - User login attempt
- `LOGIN_SUCCESS` - Successful login
- `LOGIN_FAILURE` - Failed login attempt
- `TOKEN_VALIDATED` - Token validation request
- `TOKEN_REFRESHED` - Token refresh successful
- `TOKEN_REFRESH_FAILED` - Token refresh failed
- `LOGOUT` - User logout
- `ACCOUNT_LOCKED` - Account locked due to failed attempts
- `PASSWORD_CHANGED` - Password change event

## Key Dependencies (pom.xml)
- spring-boot-starter-web
- spring-boot-starter-data-jpa
- spring-boot-starter-security
- mysql-connector-java
- jjwt (for JWT handling)
- spring-boot-starter-validation
- lombok
- spring-boot-starter-test

## Security Configuration
- JWT token-based authentication
- BCrypt password hashing
- Access token expiry: 1 hour
- Refresh token expiry: 7 days
- CORS configuration for frontend integration

## Environment Variables
```
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=auth_db
MYSQL_USERNAME=auth_user
MYSQL_PASSWORD=secure_password
JWT_SECRET=your-secret-key
JWT_EXPIRATION=3600000
REFRESH_TOKEN_EXPIRATION=604800000
```

## Development Steps
1. Initialize Spring Boot project with required dependencies
2. Set up MySQL database connection
3. Create entity models (User, RefreshToken, AuditLog)
4. Implement JWT token provider
5. Create authentication service
6. Implement audit logging service
7. Implement REST controllers
8. Add security configuration
9. Write unit and integration tests
10. Create Docker configuration
11. Document API with OpenAPI/Swagger

## Testing Strategy
- Unit tests for services and JWT provider
- Integration tests for controllers
- Test coverage target: 50%

## Deployment Considerations
- Docker containerization
- Environment-specific configuration
- Database migration management with Flyway
- Health check endpoint
- Logging configuration
- Metrics and monitoring integration