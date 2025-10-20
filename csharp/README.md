# .NET Weather API Demo

A .NET 8.0 minimal API application that integrates with the OpenWeather API, demonstrating modern C# web application patterns and external service integration suitable for traffic capture and replay testing.

## Features

- **RESTful API**: Weather forecast and health check endpoints
- **Health Checks**: Built-in health monitoring endpoint
- **External API Integration**: OpenWeather API integration with proxy support
- **Kubernetes Ready**: Complete k8s manifests with client traffic generator
- **Docker Support**: Multi-stage build for optimal performance
- **Unit Tests**: xUnit test suite with mocked external API calls
- **Swagger/OpenAPI**: Interactive API documentation

## Prerequisites

- .NET 8.0 SDK or later
- Docker (for containerized deployment)
- Kubernetes cluster (for k8s deployment)

### Installing .NET on macOS

#### Option 1: Homebrew (Recommended)
```bash
# Install Homebrew if not already installed
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Install .NET 8 SDK
brew install --cask dotnet-sdk

# Verify installation
dotnet --version
```

#### Option 2: Official Installer
```bash
# Download from https://dotnet.microsoft.com/download/dotnet/8.0
# Follow the macOS installation instructions
```

## Quick Start

### Local Development

1. **Restore dependencies**:
```bash
cd csharp
dotnet restore
```

2. **Run the application**:
```bash
dotnet run
```

The application will start on `http://localhost:5000` (or https://localhost:5001 for HTTPS)

3. **Access Swagger UI**:
Open your browser to `http://localhost:5000/swagger`

### Docker Deployment

```bash
# Build the image
docker build -t csharp-weather:latest .

# Run the container
docker run -d -p 8080:8080 csharp-weather:latest
```

### Docker Compose Deployment

```bash
# Start the application
docker compose up -d

# View logs
docker compose logs -f

# Stop the application
docker compose down
```

### Kubernetes Deployment

```bash
# Deploy everything (server + client)
kubectl apply -f manifest.yaml

# Check deployment status
kubectl get pods -l app=csharp-weather

# Check client generating traffic
kubectl logs -f deployment/csharp-client

# Access the service (port-forward)
kubectl port-forward svc/csharp-weather 8080:80

# Test the API
curl http://localhost:8080/health
```

#### Cleanup
```bash
kubectl delete -f manifest.yaml
```

## API Endpoints

| Method | Endpoint | Description | Response |
|--------|----------|-------------|----------|
| `GET` | `/health` | Health check endpoint | `{"status": "healthy", "timestamp": "..."}` |
| `GET` | `/weatherforecast` | Get 5-day weather forecast | Weather forecast array |

## API Examples

### Health Check
```bash
curl http://localhost:8080/health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-10-20T12:00:00Z"
}
```

### Weather Forecast
```bash
curl http://localhost:8080/weatherforecast
```

**Response:**
```json
[
  {
    "date": "2024-10-20",
    "temperatureC": 25,
    "temperatureF": 77,
    "summary": "scattered clouds"
  },
  ...
]
```

## Testing

### Unit Tests
```bash
# Run tests
dotnet test

# Run tests with coverage
dotnet test /p:CollectCoverage=true
```

### Manual Testing
Use the included `test.http` file with VS Code REST Client extension:

```bash
# Install VS Code REST Client extension
code --install-extension humao.rest-client

# Open test.http and click "Send Request" above each test
```

Or use the Makefile:
```bash
make test
```

## Project Structure

```
csharp/
├── Program.cs                   # Main application entry point
├── weatherService.csproj        # Project file with dependencies
├── appsettings.json             # Application configuration
├── appsettings.Development.json # Development settings
├── Dockerfile                   # Multi-stage Docker build
├── docker-compose.yml           # Docker Compose configuration
├── Makefile                     # Build and deployment targets
├── manifest.yaml                # Kubernetes deployment
├── test.http                    # REST Client test file
├── README.md                    # This file
├── .gitignore                   # Git ignore rules
├── tests/
│   ├── WeatherServiceTests.csproj
│   └── WeatherApiTests.cs      # xUnit test suite
└── client/
    ├── client.csproj
    └── Program.cs              # Traffic generator client
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ASPNETCORE_URLS` | `http://+:8080` | Server listening URL |
| `OPENWEATHER_API_KEY` | `b1e641006d0b095192f4e5dd0932f93d` | OpenWeather API key |
| `OPENWEATHER_CITY` | `Cebu City` | Default city for weather queries |
| `HTTP_PROXY` | - | HTTP proxy URL (for Speedscale) |

## Dependencies

- `Microsoft.AspNetCore.OpenApi` (~> 8.0.0) - OpenAPI support
- `Swashbuckle.AspNetCore` (~> 6.5.0) - Swagger UI
- `xUnit` (~> 2.6.2) - Testing framework (test project)

## Deployment Patterns

### Pattern 1: Full Deployment (Demo/Recording)
**Use Case**: Initial demos, Speedscale recording, development

**Components**: Server + Client

```bash
kubectl apply -f manifest.yaml
```

**What happens**:
- .NET weather service starts and listens on port 8080
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
  name: csharp-weather
spec:
  replicas: 1
  selector:
    matchLabels:
      app: csharp-weather
  template:
    metadata:
      labels:
        app: csharp-weather
    spec:
      containers:
        - name: csharp-weather
          image: gcr.io/speedscale-demos/csharp-weather:v1.2.4
          ports:
            - containerPort: 8080
              name: http
---
apiVersion: v1
kind: Service
metadata:
  name: csharp-weather
spec:
  type: ClusterIP
  ports:
    - name: http
      port: 80
      targetPort: 8080
  selector:
    app: csharp-weather
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
kubectl logs -l app=csharp-weather --tail=50

# Describe pod for events
kubectl describe pod -l app=csharp-weather
```

### .NET SDK issues
```bash
# Check installed SDKs
dotnet --list-sdks

# Clear NuGet cache
dotnet nuget locals all --clear

# Restore dependencies
dotnet restore --force
```

## Makefile Commands

The project includes a Makefile for common operations:

```bash
make help          # Show available commands
make local         # Run locally
make build         # Build the application
make test          # Run tests
make docker        # Build Docker image
make compose       # Run with docker-compose
make kube          # Deploy to Kubernetes
make kube-clean    # Remove from Kubernetes
make client        # Run traffic generator client
```

## License

MIT License - Part of Speedscale Demo Applications
