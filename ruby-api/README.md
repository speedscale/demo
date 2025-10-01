# Ruby API Demo App

A Ruby microservice built with Sinatra that provides REST API endpoints for task management with PostgreSQL database and external API integration.

## Features

- **RESTful API**: Full CRUD operations for task management
- **JWT Authentication**: Secure token-based authentication with HS512
- **PostgreSQL Database**: Persistent storage with automated initialization
- **External API Integration**: WorldTimeAPI integration with built-in rate limiting
- **Kubernetes Ready**: Complete k8s manifests with Kustomize support
- **Health Checks**: Readiness and liveness probes
- **Docker Support**: Multi-stage Debian-based build for optimal security

## Prerequisites

- Ruby 3.2 or later
- PostgreSQL 15
- Docker (for containerized deployment)
- Kubernetes cluster (for k8s deployment)

## Quick Start

### Local Development

1. **Install dependencies**:
```bash
cd ruby-api
bundle install
```

2. **Start PostgreSQL**:
```bash
# macOS with Homebrew
brew services start postgresql@15

# Or use Docker
docker run -d \
  --name postgres \
  -e POSTGRES_PASSWORD=postgres123 \
  -e POSTGRES_USER=tasks_user \
  -e POSTGRES_DB=tasks_db \
  -p 5432:5432 \
  postgres:15
```

3. **Set environment variables**:
```bash
export DB_HOST=localhost
export DB_PORT=5432
export DB_NAME=tasks_db
export DB_USER=tasks_user
export DB_PASSWORD=postgres123
```

4. **Run the application**:
```bash
ruby app.rb
```

The server will start on `http://localhost:3000` and automatically:
- Create the tasks table
- Populate it with 5 demo tasks

### Docker Deployment

```bash
# Build the image
docker build -t ruby-api:latest .

# Run the container
docker run -d \
  -p 3000:3000 \
  -e DB_HOST=postgres-service \
  -e DB_NAME=tasks_db \
  -e DB_USER=tasks_user \
  -e DB_PASSWORD=postgres123 \
  ruby-api:latest
```

### Kubernetes Deployment

#### Option 1: Full Deployment (with Client and Database)
Perfect for demos and Speedscale recording:

```bash
# Deploy everything (server + client + postgres)
kubectl apply -k .

# Check deployment status
kubectl get pods -l app.kubernetes.io/name=ruby-api

# Check client generating traffic
kubectl logs -f deployment/ruby-client

# Access the service (port-forward)
kubectl port-forward svc/ruby-server 3000:80

# Test the API
curl http://localhost:3000/health
```

#### Option 2: Full Deployment with Explicit Overlay
```bash
# Same as default, but explicit
kubectl apply -k k8s/overlays/full/
```

#### Option 3: Server-Only Deployment (for Replay)
For Speedscale traffic replay scenarios where DB is mocked:

```bash
# Deploy only the server (no client, no postgres)
kubectl apply -k k8s/overlays/server-only/

# This deploys to namespace: ruby-api-replay
kubectl get pods -n ruby-api-replay

# Server expects DB from Speedscale mock
# Speedscale replays recorded traffic against the server
```

#### Cleanup
```bash
# Full deployment
kubectl delete -k .

# Server-only deployment
kubectl delete -k k8s/overlays/server-only/
```

## Authentication

The API uses **JWT (JSON Web Tokens)** with HS512 algorithm for authentication. All endpoints except `/health` and `/login` require a valid JWT token.

### Login Flow

1. **Obtain Token**: Call `/login` with credentials
2. **Use Token**: Include token in `Authorization: Bearer <token>` header
3. **Token Expires**: After 15 minutes
4. **Refresh**: Login again to get a new token

### Demo Credentials

For demo purposes, any username works with password `demo123`:
```json
{
  "username": "any-username",
  "password": "demo123"
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | `development-secret-change-me` | JWT signing secret (use K8S secret in production) |

## API Endpoints

### Authentication

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/login` | Get JWT token | No |

### Task Management

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `GET` | `/health` | Health check endpoint | No |
| `GET` | `/tasks` | List all tasks | **Yes** |
| `GET` | `/tasks/:id` | Get a specific task | **Yes** |
| `POST` | `/tasks` | Create a new task | **Yes** |
| `PUT` | `/tasks/:id` | Update an existing task | **Yes** |
| `DELETE` | `/tasks/:id` | Delete a task | **Yes** |

### External API Integration

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| `POST` | `/api/time-convert` | Convert epoch timestamp using WorldTimeAPI | **Yes** |

## Task Schema

```json
{
  "id": 1,
  "title": "Task title",
  "description": "Task description",
  "status": "pending|in_progress|completed",
  "priority": 1,
  "created_at": "2024-01-01T12:00:00Z",
  "updated_at": "2024-01-01T12:00:00Z"
}
```

## API Examples

### Login to get JWT token
```bash
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "demo123"
  }'
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzUxMiJ9...",
  "expires_in": 900,
  "user_id": "testuser",
  "token_type": "Bearer"
}
```

**Save the token** and use it in subsequent requests.

### List all tasks
```bash
TOKEN="eyJhbGciOiJIUzUxMiJ9..."

curl http://localhost:3000/tasks \
  -H "Authorization: Bearer $TOKEN"
```

### Create a task
```bash
curl -X POST http://localhost:3000/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "New task",
    "description": "Task description",
    "status": "pending",
    "priority": 1
  }'
```

### Update a task
```bash
curl -X PUT http://localhost:3000/tasks/1 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "title": "Updated task",
    "description": "Updated description",
    "status": "completed",
    "priority": 2
  }'
```

### Delete a task
```bash
curl -X DELETE http://localhost:3000/tasks/1 \
  -H "Authorization: Bearer $TOKEN"
```

### Convert epoch timestamp
```bash
curl -X POST http://localhost:3000/api/time-convert \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "epoch": 1704067200,
    "timezone": "America/New_York"
  }'
```

**Response:**
```json
{
  "original_epoch": 1704067200,
  "timezone": "America/New_York",
  "converted_time": "2024-01-01T00:00:00+00:00",
  "api_current_time": "2024-01-15T12:34:56.789012-05:00",
  "api_timezone": "America/New_York",
  "utc_offset": "-05:00"
}
```

## Rate Limiting

The WorldTimeAPI integration includes built-in rate limiting:
- **Limit**: 1 request per second
- **Response**: HTTP 429 (Too Many Requests) when limit is exceeded
- **Retry-After**: 1 second

This ensures compliance with the external API's usage policies.

## Testing

Use the included `test.http` file with VS Code REST Client extension or similar tools to test all endpoints:

```bash
# Install VS Code REST Client extension
code --install-extension humao.rest-client

# Open test.http and click "Send Request" above each test
```

The test file includes:
- All CRUD operations
- Time conversion examples with different timezones
- Error scenarios (404, 400, 429)
- Rate limit testing

## Project Structure

```
ruby-api/
├── app.rb                             # Main Sinatra application
├── Gemfile & Gemfile.lock            # Server dependencies
├── Dockerfile                         # Server Docker build (ruby:3.2-slim)
├── Makefile                           # Build and Docker targets
├── kustomization.yaml                 # Root Kustomize (→ base)
├── test.http                          # Comprehensive API tests
├── README.md                          # This file
├── .gitignore                         # Git ignore rules
├── client/                            # Traffic generator client
│   ├── client.rb                      # Ruby client application
│   ├── Gemfile & Gemfile.lock        # Client dependencies
│   ├── Dockerfile                     # Client Docker build
│   └── README.md                      # Client documentation
└── k8s/
    ├── base/                          # Base manifests (all components)
    │   ├── kustomization.yaml
    │   ├── postgres/                  # PostgreSQL (7 files)
    │   ├── ruby-server/              # Ruby server (4 files)
    │   └── ruby-client/              # Ruby client (2 files)
    └── overlays/
        ├── full/                      # Full deployment
        │   └── kustomization.yaml     # Server + Client + DB
        └── server-only/               # Server-only for replay
            ├── kustomization.yaml
            └── namespace.yaml
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `tasks_db` | Database name |
| `DB_USER` | `postgres` | Database user |
| `DB_PASSWORD` | - | Database password (required) |
| `JWT_SECRET` | `development-secret-change-me` | JWT signing secret (must be set in production) |

## Dependencies

- `sinatra` (~> 3.1) - Web framework
- `sinatra-contrib` (~> 3.1) - Sinatra extensions
- `pg` (~> 1.5) - PostgreSQL adapter
- `httparty` (~> 0.21) - HTTP client for external API calls
- `puma` (~> 6.4) - Web server
- `json` (~> 2.7) - JSON handling
- `rack` (~> 2.2) - Web server interface
- `jwt` (~> 2.7) - JWT authentication

## Deployment Patterns

### Pattern 1: Full Stack (Demo/Recording)
**Use Case**: Initial demos, Speedscale recording, development

**Components**: Server + Client + PostgreSQL

```bash
kubectl apply -k .
# OR
kubectl apply -k k8s/overlays/full/
```

**What happens**:
- PostgreSQL starts and initializes
- Ruby server waits for PostgreSQL, then starts
- Ruby client waits for server, then generates continuous traffic
- Perfect for Speedscale to record realistic traffic patterns

### Pattern 2: Server-Only (Replay)
**Use Case**: Speedscale traffic replay, testing new versions

**Components**: Server only (no client, no DB)

```bash
kubectl apply -k k8s/overlays/server-only/
```

**What happens**:
- Server starts in `ruby-api-replay` namespace
- No PostgreSQL deployed (Speedscale mocks it)
- No client (Speedscale replays recorded traffic)
- Server responds to replayed requests with mocked DB

**Workflow**:
1. Deploy full stack and record traffic with Speedscale
2. Make changes to the server code
3. Deploy server-only and replay recorded traffic
4. Validate responses match expected behavior

### Pattern 3: Scale Client for Load Testing
**Use Case**: Load testing, stress testing

```bash
# Deploy full stack
kubectl apply -k .

# Scale up client replicas
kubectl scale deployment/ruby-client --replicas=10

# Watch metrics
kubectl top pods
```

## Troubleshooting

### Database connection errors

```bash
# Check PostgreSQL is running
pg_isready -h localhost -p 5432

# Check credentials
psql -h localhost -U tasks_user -d tasks_db
```

### Port already in use

```bash
# Find process using port 3000
lsof -i :3000

# Kill the process
kill -9 <PID>
```

### Kubernetes pod not starting

```bash
# Check pod logs
kubectl logs -l app=ruby-server --tail=50

# Check postgres logs
kubectl logs -l app=postgres --tail=50

# Describe pod for events
kubectl describe pod -l app=ruby-server
```

## License

MIT License - Part of Speedscale Demo Applications
