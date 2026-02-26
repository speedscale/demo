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

Use these exact steps to install the demo app, enable eBPF capture via annotation, generate traffic, and confirm capture with `speedctl`.

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

### 2. Enable eBPF capture (annotation)

Capture is enabled **per deployment** by adding the annotation `capture.speedscale.com/enabled: "true"` to the **Deployment** `metadata.annotations`. The gateway, java-server, csharp-weather, node-server, and php-server deployments in this scenario already have it in their manifests, so when you deploy with `kubectl apply -k scenarios/microservices/k8s`, capture is enabled for those workloads.

For **Java** workloads, also add `capture.speedscale.com/java-agent: "true"` to the deployment. The java-server deployment already has both annotations.

**With kubectl:** to add or update the annotation on deployments from the CLI:

```bash
# Enable capture on each app deployment
kubectl annotate deployment gateway csharp-weather node-server php-server -n demo-stack capture.speedscale.com/enabled="true" --overwrite
kubectl annotate deployment java-server -n demo-stack capture.speedscale.com/enabled="true" capture.speedscale.com/java-agent="true" --overwrite
```

To confirm a deployment's annotations:

```bash
kubectl get deployment java-server -n demo-stack -o jsonpath='{.metadata.annotations}' | jq .
```

### 3. Generate traffic

The stack includes a **traffic-client** deployment (patterned after [java/client/client](java/client/client)) that obtains Java auth tokens (login + RSA) and calls each app so they make **outbound HTTPS** calls: Java→SpaceX/Treasury, CSharp→OpenWeather, Node→NASA/SpaceX/GitHub, PHP→SpaceX. Traffic runs continuously for eBPF capture. It starts automatically when you deploy; no extra step required.

To confirm it is running:

```bash
kubectl get pods -n demo-stack -l app=traffic-client
kubectl logs -n demo-stack -l app=traffic-client -f
```

Optionally, you can also send traffic from your machine by port-forwarding and curling:

```bash
kubectl port-forward -n demo-stack svc/gateway 8080:80
# In another terminal:
curl -s http://localhost:8080/health
curl -s http://localhost:8080/java/healthz
curl -s http://localhost:8080/csharp/health
curl -s http://localhost:8080/node/healthz
```

### 4. Use speedctl to see if traffic is observed

Ensure `speedctl` is installed and logged in (`speedctl check`). Then list recent snapshots to confirm capture:

```bash
speedctl check
speedctl snapshot list
```

Open the [Speedscale Snapshots](https://app.speedscale.com/snapshots) page and confirm that new snapshots appear with traffic from the demo-stack (gateway, java-server, csharp-weather, node-server). You can open a snapshot and inspect request/response pairs to verify eBPF capture for each language.
