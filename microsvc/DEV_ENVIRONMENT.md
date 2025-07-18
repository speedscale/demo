# Development Environment Setup

This document describes the development environment setup for the Banking Application.

## Quick Start

1. **Prerequisites**
   - Docker and Docker Compose
   - Node.js 18+ (for frontend development)
   - Java 11+ and Maven (for backend development)

2. **Setup Environment**
   ```bash
   # Copy environment variables
   cp .env.example .env
   
   # Start development environment
   ./scripts/dev-setup.sh
   ```

3. **Access Services**
   - Database: `localhost:5432`
   - Jaeger Tracing: `http://localhost:16686`
   - Prometheus: `http://localhost:9090`
   - Grafana: `http://localhost:3001` (admin/admin)

## Services Overview

### Database (PostgreSQL)
- **Container**: `banking-postgres`
- **Port**: 5432
- **Database**: `banking_app`
- **Schemas**: `user_service`, `accounts_service`, `transactions_service`

### Observability Stack

#### Jaeger (Distributed Tracing)
- **Container**: `banking-jaeger`
- **Web UI**: `http://localhost:16686`
- **Collector**: `http://localhost:14268`

#### Prometheus (Metrics)
- **Container**: `banking-prometheus`
- **Web UI**: `http://localhost:9090`
- **Scrapes**: All microservices on `/actuator/prometheus`

#### Grafana (Dashboards)
- **Container**: `banking-grafana`
- **Web UI**: `http://localhost:3001`
- **Credentials**: admin/admin

## Backend Services (When Implemented)

| Service | Port | Container | Purpose |
|---------|------|-----------|---------|
| API Gateway | 8080 | `banking-api-gateway` | Main entry point |
| User Service | 8081 | `banking-user-service` | Authentication |
| Accounts Service | 8082 | `banking-accounts-service` | Account management |
| Transactions Service | 8083 | `banking-transactions-service` | Transaction processing |

## Frontend Service (When Implemented)

| Service | Port | Container | Purpose |
|---------|------|-----------|---------|
| Next.js App | 3000 | `banking-frontend` | Web application |

## Development Commands

### Docker Compose
```bash
# Start all services
docker compose up -d

# Start specific service
docker compose up -d postgres

# View logs
docker compose logs -f [service-name]

# Stop all services
docker compose down

# Stop and remove volumes
docker compose down -v
```

### Database Operations
```bash
# Connect to database
PGPASSWORD=password psql -h localhost -U postgres -d banking_app

# Connect as service user
PGPASSWORD=user_service_pass psql -h localhost -U user_service_user -d banking_app
```

### Service Development
```bash
# Run service locally (from service directory)
./mvnw spring-boot:run

# Build service
./mvnw clean package

# Run tests
./mvnw test
```

## Configuration Files

### Shared Configuration
- `config/application-docker.yml` - Spring Boot configuration for Docker
- `config/logback-spring.xml` - Logging configuration
- `config/prometheus.yml` - Prometheus scraping configuration

### Environment Variables
- `.env` - Local environment variables
- `.env.example` - Example environment file
- `.env.template` - Template for creating .env

## Logging

### Log Locations
- Container logs: `docker compose logs [service-name]`
- Application logs: `/var/log/banking-app.log` (inside containers)
- Local logs: `logs/` directory (when running locally)

### Log Formats
- **Console**: Human-readable format with trace correlation
- **File**: Structured format with rotation
- **JSON**: Structured JSON for log aggregation (Docker profile)

## Health Checks

### Service Health
```bash
# Check all services
docker compose ps

# Check specific service health
curl http://localhost:8080/actuator/health
```

### Database Health
```bash
# Check database connectivity
docker compose exec postgres pg_isready -U postgres
```

## Troubleshooting

### Common Issues

1. **Port conflicts**: Check if ports 3000, 5432, 8080-8083, 9090, 16686, 3001 are available
2. **Database connection**: Ensure PostgreSQL is running and accepting connections
3. **Service startup**: Check logs with `docker compose logs [service-name]`

### Reset Environment
```bash
# Stop all services and remove data
./scripts/dev-stop.sh

# Start fresh
./scripts/dev-setup.sh
```

## Security Notes

- Database passwords are for development only
- JWT secrets must be changed in production
- Services run with development security settings
- CORS is configured for local development

## Next Steps

1. Implement backend services (Phase 2)
2. Implement frontend application (Phase 3)
3. Add comprehensive testing (Phase 4)
4. Deploy to production (Phase 7)