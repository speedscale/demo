# Java Authentication Microservice

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A Spring Boot microservice providing JWT-based authentication with MySQL database backend.

## Features

- JWT token-based authentication
- Refresh token support
- User authentication with BCrypt password hashing
- Comprehensive audit logging
- Docker support
- OpenAPI/Swagger documentation
- MySQL database with Flyway migrations

## Prerequisites

- Java 17+
- Maven 3.6+
- MySQL 8.0+ (or Docker)
- Docker & Docker Compose (optional)

## Quick Start

### Using Docker Compose

1. Clone the repository
2. Run the application:
```bash
docker compose up -d
```

The service will be available at `http://localhost:8080`

### Manual Setup

1. Set up MySQL database:
```sql
CREATE DATABASE auth_db;
CREATE USER 'auth_user'@'localhost' IDENTIFIED BY 'secure_password';
GRANT ALL PRIVILEGES ON auth_db.* TO 'auth_user'@'localhost';
```

2. Configure environment variables:
```bash
export MYSQL_HOST=localhost
export MYSQL_PORT=3306
export MYSQL_DATABASE=auth_db
export MYSQL_USERNAME=auth_user
export MYSQL_PASSWORD=secure_password
export JWT_SECRET=your-secret-key-here
```

3. Build and run:
```bash
mvn clean package
java -jar target/auth-*.jar
```

## API Endpoints

### Authentication

#### Register
- **POST** `/api/auth/register`
- Request:
```json
{
  "username": "newuser",
  "email": "newuser@example.com",
  "password": "password123"
}
```
- Response:
```json
{
  "accessToken": "eyJhbGciOiJIUzUxMi...",
  "refreshToken": "550e8400-e29b-41d4-a716-446655440000",
  "tokenType": "Bearer",
  "expiresIn": 3600
}
```

#### Login
- **POST** `/api/auth/login`
- Request:
```json
{
  "username": "testuser",
  "password": "password123"
}
```
- Response:
```json
{
  "accessToken": "eyJhbGciOiJIUzUxMi...",
  "refreshToken": "550e8400-e29b-41d4-a716-446655440000",
  "tokenType": "Bearer",
  "expiresIn": 3600
}
```

#### Validate Token
- **POST** `/api/auth/validate`
- Request:
```json
{
  "token": "eyJhbGciOiJIUzUxMi..."
}
```
- Response:
```json
{
  "valid": true,
  "username": "testuser",
  "expiresAt": "2024-01-01T12:00:00"
}
```

#### Refresh Token
- **POST** `/api/auth/refresh`
- Request:
```json
{
  "refreshToken": "550e8400-e29b-41d4-a716-446655440000"
}
```
- Response:
```json
{
  "accessToken": "eyJhbGciOiJIUzUxMi...",
  "refreshToken": "660e8400-e29b-41d4-a716-446655440000",
  "tokenType": "Bearer",
  "expiresIn": 3600
}
```

#### Get Current User (Protected)
- **GET** `/api/auth/user`
- Headers: `Authorization: Bearer <accessToken>`
- Response:
```json
{
  "id": 1,
  "username": "testuser",
  "email": "testuser@example.com",
  "enabled": true
}
```

## Test Users

The following test users are created by default:
- `demo` - Demo account (password: `password`)
- `admin` - Administrator account (password: `password123`)
- `testuser` - Regular user (password: `password123`)
- `johndoe` - Regular user (password: `password123`)
- `janedoe` - Regular user (password: `password123`)
- `disableduser` - Disabled account (password: `password123`)

## API Documentation

Swagger UI is available at: `http://localhost:8080/swagger-ui.html`

## Configuration

Key configuration properties in `application.yml`:

```yaml
jwt:
  secret: ${JWT_SECRET:your-secret-key}
  expiration: ${JWT_EXPIRATION:3600000}  # 1 hour
  refresh-token-expiration: ${REFRESH_TOKEN_EXPIRATION:604800000}  # 7 days
```

## Database Schema

The service uses three main tables:
- `users` - User accounts
- `refresh_tokens` - Refresh token storage
- `audit_logs` - Authentication audit trail

## Monitoring

Health check endpoint: `GET /actuator/health`

## Security Considerations

1. Change the default JWT secret in production
2. Use HTTPS in production
3. Configure CORS appropriately for your frontend
4. Review and adjust token expiration times
5. Implement rate limiting for login attempts
6. Regular security audits of dependencies

## Development

### Make Commands

This project includes a Makefile for common development tasks:

```bash
make help          # Show all available commands
```

#### Development Workflow
```bash
make setup         # Initial project setup (install deps, start services)
make build         # Build the application JAR
make test          # Run all tests
make test-coverage # Run tests with coverage report
make run           # Run application locally
```

#### Docker Commands
```bash
make up            # Start MySQL and application containers
make down          # Stop all containers
make logs          # Show container logs
make logs-app      # Show application logs only
make status        # Show service status
```

#### Docker Images
```bash
make docker-build      # Build Docker image with version tag
make docker-build-prod # Build production-optimized image
make docker-run        # Run container (requires external MySQL)
make docker-clean      # Remove application Docker images
```

#### Database Management
```bash
make db-migrate    # Run database migrations
make db-info       # Show migration status
make db-reset      # Reset database (WARNING: destroys data)
```

#### Code Quality
```bash
make lint          # Check code formatting
make format        # Format code
make deps          # Download dependencies
make deps-check    # Check for dependency updates
```

#### API Testing
```bash
make test-api      # Test API endpoints
make health        # Check application health
make api-docs      # Instructions to open API documentation
```

#### Client Testing
```bash
make client              # Run auth client
make client-docker-build # Build client Docker image
make client-docker-run   # Run client in Docker
```

#### Kubernetes Deployment
```bash
make kube                # Deploy to Kubernetes (Deployment)
make kube-clean          # Remove from Kubernetes
make kube-statefulset    # Deploy as StatefulSet (stable pod names, persistent storage)
make kube-statefulset-clean  # Remove StatefulSet deployment
```

#### Utilities
```bash
make env-example   # Create .env.example file
```

Note: For version management, use the root Makefile:
```bash
cd ../.. && make version      # Show current version
cd ../.. && make bump-version # Bump to next patch version
```

### Manual Commands

If you prefer using Maven directly:

#### Building
```bash
./mvnw clean package
```

#### Running Tests
```bash
./mvnw test
```

#### Code Coverage
```bash
./mvnw clean test jacoco:report
```

## License

This project is licensed under the MIT License.