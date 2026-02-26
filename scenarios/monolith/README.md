# Monolith Demo Scenario

Run a **single application** in Kubernetes for traffic capture, replay, or single-service testing. Choose **Java**, **.NET**, or **Node.js**.

## What runs (pick one)

| Stack   | App | Endpoints |
|--------|-----|-----------|
| **Java**   | [java/](../../java/) – Spring Boot (SpaceX, US Treasury, built-in JWT) | `/healthz`, `/login`, `/spacex/*`, `/treasury/*` |
| **.NET**   | [csharp/](../../csharp/) – .NET 8 weather API (OpenWeather) | `/health`, `/weatherforecast`, `/swagger` |
| **Node.js**| [node/](../../node/) – Express (GitHub, SpaceX, NASA, httpbin) | `/`, `/healthz`, `/nasa`, `/space`, `/events`, `/bin` |

## Deploy (Kubernetes)

From the **repository root**:

**Java**
```bash
kubectl apply -f java/manifest.yaml
```

**.NET**
```bash
kubectl apply -f csharp/manifest.yaml
```

**Node.js**
```bash
kubectl apply -f node/manifest.yaml
```

See each project’s README for service names, port-forward, and cleanup: [java/README.md](../../java/README.md), [csharp/README.md](../../csharp/README.md), [node/README.md](../../node/README.md).

## Version and builds

Version and image tags are managed from the repo root. Use `make bump-version` or `make update-version VERSION=x.y.z`; then build images (e.g. `make docker-java`, `make docker-csharp`, `make docker-node`).
