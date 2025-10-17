# PHP SpaceX API Demo

A PHP Slim Framework application that proxies SpaceX API data, demonstrating modern PHP 8.3 features and API integration patterns suitable for traffic capture and replay testing.

## Features

- **RESTful API**: Simple proxy endpoints for SpaceX data
- **Health Checks**: Built-in health monitoring endpoint
- **External API Integration**: SpaceX API integration with error handling
- **Kubernetes Ready**: Complete k8s manifests with client traffic generator
- **Docker Support**: Multi-stage Alpine-based build for optimal security
- **Unit Tests**: PHPUnit test suite with mocked external API calls

## Prerequisites

- PHP 8.3 or later
- Composer
- Docker (for containerized deployment)
- Kubernetes cluster (for k8s deployment)

### Installing PHP on macOS

#### Option 1: Homebrew (Recommended)
```bash
# Install Homebrew if not already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install PHP 8.3
brew install php@8.3

# Add PHP to your PATH (add to ~/.zshrc or ~/.bash_profile)
echo 'export PATH="/opt/homebrew/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc

# Verify installation
php --version
```

#### Option 2: Official PHP.net
```bash
# Download PHP 8.3 from https://www.php.net/downloads.php
# Follow the macOS installation instructions
```

#### Install Composer
```bash
# Download and install Composer
curl -sS https://getcomposer.org/installer | php
sudo mv composer.phar /usr/local/bin/composer

# Verify installation
composer --version
```

## Quick Start

### Local Development

1. **Install dependencies**:
```bash
cd php
composer install
```

2. **Run the application**:
```bash
php -S localhost:8081 index.php
```

The application will start on `http://localhost:8081`

### Docker Deployment

```bash
# Build the image
docker build -t php-server:latest .

# Run the container
docker run -d -p 8081:8081 php-server:latest
```

### Kubernetes Deployment

```bash
# Deploy everything (server + client)
kubectl apply -f manifest.yaml

# Check deployment status
kubectl get pods -l app=php-server

# Check client generating traffic
kubectl logs -f deployment/php-client

# Access the service (port-forward)
kubectl port-forward svc/php-server 8081:80

# Test the API
curl http://localhost:8081/health
```

#### Cleanup
```bash
kubectl delete -f manifest.yaml
```

## API Endpoints

| Method | Endpoint | Description | Response |
|--------|----------|-------------|----------|
| `GET` | `/health` | Health check endpoint | `{"status": "ok"}` |
| `GET` | `/spacex/launches` | Proxy SpaceX latest launch data | SpaceX API response or error |

## API Examples

### Health Check
```bash
curl http://localhost:8081/health
```

**Response:**
```json
{
  "status": "ok"
}
```

### SpaceX Launches
```bash
curl http://localhost:8080/spacex/launches
```

**Response:**
```json
{
  "id": "launch-id",
  "name": "Launch Name",
  "date_utc": "2024-01-01T00:00:00.000Z",
  "success": true,
  ...
}
```

### Error Response
```json
{
  "error": "API Error message"
}
```

## Testing

### Unit Tests
```bash
# Run PHPUnit tests
composer test

# Run tests with coverage
vendor/bin/phpunit --coverage-text
```

### Manual Testing
Use the included `test.http` file with VS Code REST Client extension:

```bash
# Install VS Code REST Client extension
code --install-extension humao.rest-client

# Open test.http and click "Send Request" above each test
```

## Project Structure

```
php/
├── index.php                    # Main Slim application
├── composer.json                # Dependencies and scripts
├── Dockerfile                   # Multi-stage Docker build
├── Makefile                     # Build and Docker targets
├── manifest.yaml                # Kubernetes deployment
├── test.http                    # REST Client test file
├── phpunit.xml                  # PHPUnit configuration
├── README.md                    # This file
├── .gitignore                   # Git ignore rules
└── tests/
    └── ApiTest.php             # PHPUnit test suite
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8080` | Server port (not configurable in current implementation) |

## Dependencies

- `slim/slim` (~> 4.12) - Web framework
- `guzzlehttp/guzzle` (~> 7.8) - HTTP client for external API calls
- `phpunit/phpunit` (~> 10.5) - Testing framework (dev dependency)

## Deployment Patterns

### Pattern 1: Full Deployment (Demo/Recording)
**Use Case**: Initial demos, Speedscale recording, development

**Components**: Server + Client

```bash
kubectl apply -f manifest.yaml
```

**What happens**:
- PHP server starts and listens on port 8080
- Client waits for server, then generates continuous traffic
- Perfect for Speedscale to record realistic traffic patterns

### Pattern 2: Server-Only (Replay)
**Use Case**: Speedscale traffic replay, testing new versions

**Components**: Server only (no client)

```bash
# Deploy only the server deployment and service
kubectl apply -f - <<EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: php-server
spec:
  replicas: 1
  selector:
    matchLabels:
      app: php-server
  template:
    metadata:
      labels:
        app: php-server
    spec:
      containers:
        - name: php-server
          image: gcr.io/speedscale-demos/php-server:v1.2.4
          ports:
            - containerPort: 8080
              name: http
---
apiVersion: v1
kind: Service
metadata:
  name: php-server
spec:
  type: ClusterIP
  ports:
    - name: http
      port: 80
      targetPort: 8080
  selector:
    app: php-server
EOF
```

**What happens**:
- Server starts and responds to replayed requests
- No client (Speedscale replays recorded traffic)
- Server responds to replayed requests

## Troubleshooting

### Port already in use
```bash
# Find process using port 8080
lsof -i :8080

# Kill the process
kill -9 <PID>
```

### Kubernetes pod not starting
```bash
# Check pod logs
kubectl logs -l app=php-server --tail=50

# Describe pod for events
kubectl describe pod -l app=php-server
```

### Composer issues
```bash
# Clear composer cache
composer clear-cache

# Reinstall dependencies
rm -rf vendor composer.lock
composer install
```

## License

MIT License - Part of Speedscale Demo Applications
