# Demo Scenarios (Java, .NET, Node)

Standard demo scenarios using **Java**, **.NET**, and **Node.js** apps. Deployments are **Kubernetes only**; version is managed from the repo root (see [AGENTS.md](../AGENTS.md)).

| Scenario | Description |
|----------|-------------|
| **[Monolith](monolith/)** | Run a **single** app in K8s: **Java**, **.NET**, or **Node.js** (each project’s own manifests). |
| **[Microservices](microservices/)** | **Java + .NET + Node** behind one gateway in the `demo-stack` namespace. |

---

## Quick reference

**Monolith** – Deploy one stack from repo root:

- Java: `kubectl apply -f java/manifest.yaml` (see [java/README.md](../java/))
- .NET: `kubectl apply -f csharp/manifest.yaml` (see [csharp/README.md](../csharp/))
- Node: `kubectl apply -f node/manifest.yaml` (see [node/README.md](../node/))

**Microservices (gateway + Java + .NET + Node)** – From repo root:

```bash
./scenarios/microservices/k8s/deploy-minikube.sh
```

Then e.g. `kubectl port-forward -n demo-stack svc/gateway 8080:80` and use `http://localhost:8080/health`, `/java/*`, `/csharp/*`, `/node/*`.

The **gateway** is version-managed like other demos: `make update-version VERSION=x.y.z` updates `scenarios/microservices/gateway/package.json` and the gateway image tag in `scenarios/microservices/k8s/gateway.yaml`. Build with `make docker-gateway` from the repo root.
