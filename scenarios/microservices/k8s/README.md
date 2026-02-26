# Kubernetes deployment (minikube)

Deploy the Java + .NET + Node stack with gateway to a local cluster (e.g. minikube). All images are built locally; no registry required.

## Prerequisites

- [minikube](https://minikube.sigs.k8s.io/docs/start/) running (`minikube start`)
- [kubectl](https://kubernetes.io/docs/tasks/tools/) configured to use minikube
- Docker (used by minikube for builds)

## Deploy

From the **repository root**:

```bash
./scenarios/microservices/k8s/deploy-minikube.sh
```

This will:

1. Use minikube’s Docker daemon (`eval $(minikube docker-env)`)
2. Build four images: `scenarios-gateway:local`, `java-server:local`, `csharp-weather:local`, `node-server:local`
3. Apply manifests to namespace `demo-stack` (creates namespace, deployments, services, and the Java TLS secret)
4. Wait for all deployments to be ready

## Access the gateway

**Option A: Port-forward (works from host)**

```bash
kubectl port-forward -n demo-stack svc/gateway 8080:80
```

Then:

- Gateway health: `curl http://localhost:8080/health`
- Java: `curl http://localhost:8080/java/healthz`
- .NET: `curl http://localhost:8080/csharp/health`
- Node: `curl http://localhost:8080/node/healthz`

**Option B: Minikube NodePort**

Gateway Service is `NodePort` with port 30080. If your minikube driver exposes the node IP to the host:

```bash
curl http://$(minikube ip):30080/health
```

Otherwise use Option A.

## Cleanup

```bash
kubectl delete namespace demo-stack
```

## Manifests

| File | Purpose |
|------|---------|
| `namespace.yaml` | Namespace `demo-stack` |
| `java-server.yaml` | Java deployment, service, TLS secret |
| `csharp-weather.yaml` | .NET deployment and service |
| `node-server.yaml` | Node deployment and service |
| `gateway.yaml` | Gateway deployment and NodePort service |
| `kustomization.yaml` | Kustomize entrypoint |

Images use `*:local` and `imagePullPolicy: IfNotPresent` so minikube uses the images built by `deploy-minikube.sh`.
