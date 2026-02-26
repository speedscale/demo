# Speedscale Demos

This repository contains various self-contained demo applications that showcase different programming languages, frameworks, and deployment patterns. Each demo is designed to work with Speedscale's traffic recording, mocking, and replay capabilities.

For contributor guidance, see [Repository Guidelines](AGENTS.md).

## Demo Scenarios (Java, .NET, Node)

Demos are **Kubernetes-only**. Use the [**scenarios/**](scenarios/README.md) directory:

- **[Monolith](scenarios/monolith/)** – Run a **single** app in K8s: **Java**, **.NET**, or **Node.js** via each project’s manifests (`kubectl apply -f java/manifest.yaml`, etc.).
- **[Microservices](scenarios/microservices/)** – **Java + .NET + Node** behind one gateway in namespace `demo-stack`: from repo root, `./scenarios/microservices/k8s/deploy-minikube.sh`. The gateway is version-managed like other demos (`make update-version`, `make docker-gateway`).

- **[eBPF language validation](docs/eBPF-language-validation.md)** – Scope for validating eBPF traffic capture (PHP, .NET, Node.js, Java) over HTTP/HTTPS on Rancher Desktop.

## Demo Projects

### [Java](java/)
A Spring Boot application that integrates with external APIs (SpaceX and US Treasury). Features JWT authentication, health checks, and comprehensive API endpoints for testing traffic capture and replay scenarios.

### [Java Auth](java-auth/)
A complete JWT-based authentication microservice built with Spring Boot and MySQL. Includes user registration, login, token validation, refresh tokens, and audit logging. Perfect for demonstrating secure API interactions and database traffic patterns.

### [Node.js](node/)
A Node.js Express application with multiple endpoints that call external APIs including GitHub, SpaceX, NASA, and httpbin. Includes comprehensive documentation for local, Docker, and Kubernetes deployment scenarios.

### [Go](go/)
An IP distance calculator service that uses the ipstack API to determine geographical distances between IP addresses. Demonstrates API integration patterns and mathematical calculations in Go.

### [Python](python/)
A Flask application that proxies SpaceX API data, providing a simple example of Python-based API integration suitable for traffic capture and replay testing.

### [PHP](php/)
A PHP Slim Framework application that proxies SpaceX API data, demonstrating modern PHP 8.3 features and API integration patterns suitable for traffic capture and replay testing.

### [Node API](node-api/)
A Node.js/Express IP distance API similar to the Go version, featuring ipstack integration, haversine distance calculations, and optional DynamoDB caching with AWS SDK v3.

### [C#/.NET](csharp/)
A .NET 8.0 minimal API weather service that integrates with OpenWeather API. Features health checks, Swagger/OpenAPI documentation, Docker support, Kubernetes manifests with client traffic generator, and comprehensive test suite. Demonstrates modern C# patterns and external service integration.

### [NGINX](nginx/)
A Kubernetes-based demo featuring multiple nginx services (gateway, payment, user) that simulate a microservices architecture. Perfect for demonstrating service mesh traffic patterns.

### [ArgoCD](argo/)
A GitOps deployment solution using ArgoCD for multi-cluster Kubernetes deployments. Shows how to manage application deployments across different cluster environments.

### [AWS Services](aws/)
Contains AWS-specific demos including DynamoDB integration examples, demonstrating cloud service integration patterns.

## Version Management

This repository uses centralized version management through a root-level `VERSION` file and Makefile. All projects (Java, Java-Auth, Node) inherit their version from this central source.

### Available Commands

```bash
# Show current version
make version

# Update to a specific version (updates all manifests, pom.xml, package.json)
make update-version VERSION=1.2.3

# Automatically bump to next patch version
make bump-version

# Validate that all files use consistent versions
make validate-version

# Create a new release with git tag
make release VERSION=1.2.3
```

### What Gets Updated

When you update the version, the following files are automatically synchronized:

- **Kubernetes Manifests**: All Docker image tags in `**/manifest.yaml` and `k8s/**/*.yaml`
- **Maven Projects**: Project versions in `pom.xml` files (preserves dependency versions)
- **Node.js**: Version in `package.json`
- **Documentation**: Version references in markdown files
- **CI/CD**: GitHub Actions uses the centralized version for Docker builds

### Example Workflow

```bash
# Check current state
make validate-version

# Bump to next version (e.g., 1.0.9 → 1.0.10)
make bump-version

# Or set specific version
make update-version VERSION=2.0.0

# Create release
make release VERSION=2.0.0
```

### Manual Version File

You can also manually edit the `VERSION` file and run `make update-version VERSION=$(cat VERSION)` to sync all files.

## Project Structure and Makefiles

Each project directory contains its own `Makefile` for local development convenience:

- **`java/Makefile`** - Java service development commands
- **`java-auth/Makefile`** - Java Auth service development commands  
- **`node/Makefile`** - Node service development commands

### Root vs Project Makefiles

The **root Makefile** provides centralized commands that delegate to project Makefiles:

```bash
# Root commands (work from repository root)
make docker-java-auth      # Builds java-auth Docker images
make build-java-auth       # Builds java-auth application  
make test-java-auth        # Runs java-auth tests

# Project commands (work from project directory)
cd java-auth
make local                 # Run service locally
make compose              # Run with Docker Compose
make client               # Run test client
make kube                 # Deploy to Kubernetes
```

### Quick Start Pattern

For development, you can work directly in project directories:

```bash
cd java-auth
make help                 # See all available commands
make local               # Start the service locally
make client             # Test with client
```

Or use root commands for CI/automation:

```bash
make build-java-auth     # Build from root
make docker-java-auth    # Build and push images from root
```
