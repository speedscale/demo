# Microservices Demo Scenario (Java, .NET, Node, PHP)

**Java + .NET + Node + PHP** behind one gateway. Kubernetes only; all traffic goes through the gateway.

## What runs

| Service | Role |
|--------|------|
| **gateway** | Reverse proxy; routes `/java/*`, `/csharp/*`, `/node/*`, `/php/*` to backends. Version-managed like other demos. |
| **java-server** | [java/](../../java/) – Spring Boot |
| **csharp-weather** | [csharp/](../../csharp/) – .NET 8 weather API |
| **node-server** | [node/](../../node/) – Express |
| **php-server** | [php/](../../php/) – Slim (PHP); SpaceX proxy |
| **traffic-client** | Continuously calls gateway so each app makes outbound HTTPS (Java→SpaceX/Treasury, CSharp→OpenWeather, Node→NASA/SpaceX/GitHub, PHP→SpaceX). |

Manifests live in [k8s/](k8s/). Gateway app is in [gateway/](gateway/).

## Deploy (Kubernetes)

From the **repository root**:

```bash
./scenarios/microservices/k8s/deploy-minikube.sh
```

This builds the gateway and backend images (with the version from the repo root), applies the manifests to namespace `demo-stack`, and waits for rollouts. See [k8s/README.md](k8s/README.md) for details.

**Access the gateway** (e.g. after deploy):

```bash
kubectl port-forward -n demo-stack svc/gateway 8080:80
```

Then:

- `curl http://localhost:8080/health`
- `curl http://localhost:8080/java/healthz`
- `curl http://localhost:8080/csharp/health`
- `curl http://localhost:8080/node/healthz`
- `curl http://localhost:8080/php/health`

## Version management

The gateway is included in the repo’s centralized versioning:

- **package.json**: `scenarios/microservices/gateway/package.json` — updated by `make update-version VERSION=x.y.z`
- **Image tag**: `scenarios/microservices/k8s/gateway.yaml` uses `gcr.io/speedscale-demos/scenarios-gateway:v<VERSION>`, also updated by `make update-version`
- **Build/push**: From repo root, `make docker-gateway` (or `cd scenarios/microservices/gateway && make docker-multi VERSION=$(cat ../../../VERSION)`)

Use `make bump-version` or `make update-version VERSION=x.y.z` at the repo root so the gateway stays in sync with Java, .NET, Node, and other demos.
