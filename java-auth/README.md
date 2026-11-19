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

The service will be available at `http://localhost:8081` (Compose maps host `8081` to the container's `8080`)

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

Swagger UI is available at: `http://localhost:8081/swagger-ui.html` (via Docker Compose; `8080` if you run the jar directly)

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

## Security fast lane demo

A JDK or library upgrade should not change how the service behaves. This demo replays recorded traffic against the upgraded build, with MySQL mocked, and answers four questions before the upgrade ships:

1. Did functionality break?
2. Did performance regress?
3. Are there new security issues?
4. Does the build pass the readiness gate?

The case that prompted it is CVE-2026-114938, a memory-corruption bug in the HotSpot Base64 decoder (the AVX-512 VBMI intrinsic). It affects Java 17.0.6 and later, 21, 25 and 27. Corretto 21.0.13.1.2 fixes it. Until a service is patched, `-XX:-UseBASE64Intrinsics` turns the vulnerable code off.

The runtime image takes its JDK from the `CORRETTO_TAG` build argument, so the same app can be built on the deployed `21.0.12` and the patched `21.0.13`.

`proxymock/recording/` holds 35 inbound requests and the 480 MySQL calls behind them (startup migrations included), recorded against the 21.0.12 image with `./traffic.sh`. The traffic covers logins, token checks, refresh, registration and eight malformed or forged tokens. It is generated for the demo, not captured from production.

### Check one upgrade

Needs Docker, `jq` and proxymock.

```bash
make fast-lane
```

This builds the deployed and patched images and runs `./fast-lane-check.sh <candidate image> <deployed image>`:

```
Did functionality break?   PASS  2660 of 2660 assertions match the recording
Did performance regress?   PASS  p95 9 ms deployed, 8.7 ms candidate (-3.3%, budget +50%)
Any new security issues?   PASS  0 new findings, 16 unchanged; auth probe: 0 endpoints answered without a credential
Readiness gate             PASS  Regression A, Security D, Mock fidelity A, Data layer A

VERDICT: READY for production
```

The script exits 0 when the verdict is ready and non-zero when it is not. A run takes about 30 seconds and no database runs during it.

How each answer is produced:

- **Functionality.** The recording is replayed 20 times against the candidate with the `security-patch` test config (`proxymock/testconfigs/security-patch.json`). Each response is compared with the recorded one on status, content type and every body field except `accessToken`, `refreshToken` and the error `timestamp`, which are new on every run. All assertions have to pass.
- **Performance.** The deployed image is replayed in the same run, the same way. Each image gets 20 warm-up passes that are not scored. The candidate's p95 may not sit more than `PERF_BUDGET_PCT` (default 50) percent above the deployed image's.
- **Security.** `proxymock report --baseline` compares the two replays and lists each security finding as new, unchanged or resolved. Any new finding fails the check, apart from tentative ones. The replay also sends a request with the `Authorization` header removed and fails if the service answers 2xx. The 16 unchanged findings are properties of the demo app, such as credentials sent over plain HTTP.
- **Readiness gate.** The test config's `readiness` section sets which grades block: Regression, Mock fidelity and Data layer below A, Security below D. Performance is advisory here because the comparison above covers it.

Speedscale does not scan the image. Rescan the rebuilt image with your own scanner; this check covers behavior.

### Check a set of upgrades

```bash
make fast-lane-matrix
```

Each row is the one-line change a dependency bot would open: a different `CORRETTO_TAG` or one version in `pom.xml`. Results from 2026-11-18 on Docker Desktop for Mac with proxymock v2.5.1413:

| Upgrade | Functionality | p95, deployed to candidate | New security findings | Verdict |
|---|---|---|---|---|
| JDK 21.0.12 to 21.0.13 (CVE patch) | 2660 of 2660 | 9 to 8.7 ms | 0 | READY |
| JDK 21 to 25.0.5 | 2660 of 2660 | 9.3 to 8.7 ms | 0 | READY |
| Spring Boot 4.0.9 to 4.1.2 | 2660 of 2660 | 10.8 to 8.9 ms | 0 | READY |
| MySQL driver 8.2.0 to 9.7.0 | 2660 of 2660 | 10.2 to 9.1 ms | 0 | READY |
| MySQL driver 8.2.0 to 26.10.0 | 2660 of 2660 | 8.9 to 9.6 ms | 0 | READY |
| jjwt 0.12.3 to 0.13.0 | 2660 of 2660 | 17.4 to 7.8 ms | 0 | READY |
| MyBatis starter 4.0.1 to 4.1.0 | 2660 of 2660 | 8 to 7.9 ms | 0 | READY |
| springdoc 3.0.3 to 3.2.0 | 2660 of 2660 | 8.3 to 8.8 ms | 0 | READY |
| CVE mitigation flag on the deployed JDK | 2660 of 2660 | 8.6 to 9.6 ms | 0 | READY |
| Control: default time zone changed | 2560 of 2660 | 9.8 to 9.5 ms | 0 | NOT READY |
| Control: JIT compiler turned off | 2660 of 2660 | 8.2 to 25.6 ms | 0 | NOT READY |
| Control: security headers turned off | 2660 of 2660 | 10.2 to 9.1 ms | 3 | NOT READY |

Every real upgrade came back ready. None of them was altered to pass or fail.

The last three rows are controls, deliberate changes aimed at one question each:

- `-Duser.timezone=America/New_York` shifts `expiresAt` in the five `/validate` responses for valid tokens. Regression drops to C, so the gate fails too.
- `-Xint` turns the JIT compiler off. Responses are identical and p95 triples.
- Turning off Spring Security's response headers leaves every response body identical and every readiness grade unchanged. The comparison reports three new findings, "Authenticated response is cacheable", on `/user`, `/login` and `/register`.

### Limits

- Latency on a laptop is noisy. The deployed image's p95 ranged from 8 to 17.4 ms across these runs, so the 50% budget only catches a large regression. Tighten `PERF_BUDGET_PCT` on a quiet runner.
- The replay covers the recorded requests only. An endpoint the recording never calls is not checked.
- Six recorded responses are 500s (malformed tokens sent to `/validate` and a duplicate registration). The check compares with what the deployed build returned, bugs included.
- This service never calls `java.util.Base64`. jjwt and Jackson decode Base64 with their own code, and a class-load log (`-Xlog:class+load`) over startup and a full replay shows the JDK class is never loaded. A scanner still flags the JDK and it still has to be patched. The check shows the patch changes nothing.

### Other targets

```bash
make fast-lane-mitigation  # deployed JDK with -XX:-UseBASE64Intrinsics
make fast-lane-record      # re-record the traffic against the deployed image
```

Set `APP_PORT` if something else already uses port 8091. A ten-year `JWT_EXPIRATION` keeps the recorded tokens valid at replay time.

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