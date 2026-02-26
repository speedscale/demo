# eBPF Language Validation

This document defines the scope for validating Speedscale's eBPF-based traffic capture across language runtimes: which languages we test, HTTP/HTTPS coverage, one snapshot per language, and the local test environment. Further protocol or customer-specific validation may be added later.

---

## Languages we will test

We validate eBPF capture for these four language runtimes using the demo apps in this repo:

| Language | Runtime / version | Demo in repo |
|----------|-------------------|--------------|
| **PHP** | PHP-FPM 8.1+ | [php/](php/) |
| **.NET** | .NET 6 / 8 | [csharp/](csharp/) |
| **Node.js** | Node 18 / 20 LTS | [node/](node/) |
| **Java** | JDK 17 / 21 | [java/](java/) |

---

## HTTP and HTTPS

Validation confirms that eBPF capture works for:

- **HTTP** — Plaintext HTTP traffic is captured correctly (request/response fidelity).
- **HTTPS** — TLS traffic is observed as plaintext where applicable (eBPF uprobes on the runtime’s TLS library), so captures contain decrypted headers and bodies, not raw ciphertext.

Further protocol validation (e.g. HTTP/2, gRPC) may be added later.

---

## Snapshot per language

For each language above we capture traffic and produce **one Speedscale snapshot** (or equivalent artifact) as proof of capture for that runtime.

| Language | Snapshot | Notes |
|----------|----------|-------|
| PHP | _pending_ | |
| .NET | _pending_ | |
| Node.js | _pending_ | |
| Java | _pending_ | |

Fill in the Snapshot column with a link (or “done”) and any Notes when runs are complete.

---

## Test environment: Rancher Desktop (local)

Tests are run **locally** using **Rancher Desktop** as the Kubernetes environment (not cloud EKS/GKE/AKS).

**Prerequisites:**

- Rancher Desktop with Kubernetes 1.27+
- Speedscale DaemonSet (latest release) installed in the cluster
- Demo stack deployed so each language service is reachable (e.g. [scenarios/microservices](scenarios/microservices/) or per-language manifests from [scenarios/](scenarios/))

---

## Step-by-step: Install demo, configure capture, verify with speedctl

Use these exact steps to install the demo app, point the Speedscale NetTap config at it, generate traffic, and confirm capture with `speedctl`.

### 1. Install the demo app

All images are published to **gcr.io/speedscale-demos/** (gateway, java-server, csharp-weather, node-server) by the CI pipeline. No local build is required. From the **repository root**, with Rancher Desktop (or any cluster) running and `kubectl` context set:

```bash
# Deploy the stack into namespace demo-stack (images pull from gcr.io)
kubectl apply -k scenarios/microservices/k8s

# Wait until all deployments are ready
kubectl rollout status deployment/gateway -n demo-stack --timeout=120s
kubectl rollout status deployment/java-server -n demo-stack --timeout=120s
kubectl rollout status deployment/csharp-weather -n demo-stack --timeout=120s
kubectl rollout status deployment/node-server -n demo-stack --timeout=120s
```

Image tags follow the repo [VERSION](VERSION) file and are updated by `make update-version` / `make bump-version`. The gateway image is built and pushed by CI on the `master` branch along with the other demo images.

### 2. Add capture targets to the speedscale-nettap ConfigMap

The Speedscale operator installs a ConfigMap named `speedscale-nettap` in the cluster. Add (or merge) the following capture and logging section into that ConfigMap.

**Find the ConfigMap namespace** (often `speedscale`, `default`, or the operator’s namespace):

```bash
kubectl get configmap speedscale-nettap -A
```

**Edit the ConfigMap** and ensure it contains a `data.config.yaml` (or the key your agent expects) with `capture.targets` and `logging`:

```bash
# Replace <NETTAP_NAMESPACE> with the namespace from the command above (e.g. speedscale)
kubectl edit configmap speedscale-nettap -n <NETTAP_NAMESPACE>
```

**Paste or merge this into the ConfigMap’s `data`** (as the value of `config.yaml` or the agent’s config key). This targets the `demo-stack` namespace and all four demo services (gateway, java-server, csharp-weather, node-server):

```yaml
  config.yaml: |
    capture:
      targets:
      - name: demo-gateway
        namespaceSelector:
          matchLabels:
            app.kubernetes.io/name: demo-stack
        podSelector:
          matchLabels:
            app: gateway
      - name: demo-java
        namespaceSelector:
          matchLabels:
            app.kubernetes.io/name: demo-stack
        podSelector:
          matchLabels:
            app: java-server
      - name: demo-csharp
        namespaceSelector:
          matchLabels:
            app.kubernetes.io/name: demo-stack
        podSelector:
          matchLabels:
            app: csharp-weather
      - name: demo-node
        namespaceSelector:
          matchLabels:
            app.kubernetes.io/name: demo-stack
        podSelector:
          matchLabels:
            app: node-server
    logging:
      level: info
```

Save and exit. The eBPF agent will pick up the updated config (restart the DaemonSet pods if it does not reload automatically).

### 3. Generate traffic

Port-forward the gateway and send requests so there is traffic to capture:

```bash
kubectl port-forward -n demo-stack svc/gateway 8080:80
```

In another terminal:

```bash
curl -s http://localhost:8080/health
curl -s http://localhost:8080/java/healthz
curl -s http://localhost:8080/csharp/health
curl -s http://localhost:8080/node/healthz
```

Repeat or add more requests as needed (e.g. `/`, `/nasa`, `/events`) so capture has enough data.

### 4. Use speedctl to see if traffic is observed

Ensure `speedctl` is installed and logged in (`speedctl check`). Then list recent snapshots to confirm capture:

```bash
speedctl check
speedctl snapshot list
```

Open the [Speedscale Snapshots](https://app.speedscale.com/snapshots) page and confirm that new snapshots appear with traffic from the demo-stack (gateway, java-server, csharp-weather, node-server). You can open a snapshot and inspect request/response pairs to verify eBPF capture for each language.
