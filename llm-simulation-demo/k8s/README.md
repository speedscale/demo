# LLM Simulation Demo — Kubernetes

Kubernetes manifests for the LLM Simulation Demo. Tested with minikube, kind, and GKE.

## Prerequisites

- `kubectl` >= 1.28
- A running cluster (minikube, kind, GKE, EKS, AKS, …)
- At least one LLM provider API key

## Quick start

### 1. Supply API keys

**Option A — helper script (recommended)**

```bash
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export GEMINI_API_KEY=AIza...
./configure-keys.sh
```

**Option B — YAML file**

```bash
cp api-keys.secret.example.yaml api-keys.secret.yaml
# Edit api-keys.secret.yaml and fill in your keys
kubectl apply -f api-keys.secret.yaml
```

> `api-keys.secret.yaml` is gitignored. Never commit it.

### 2. Deploy everything

```bash
kubectl apply -k .
```

This creates:
- Namespace `llm-simulation`
- ConfigMap `llm-simulation-config`
- Deployment + Service for the backend (port 8000 → ClusterIP :80)
- Deployment + Service for the frontend (port 3000 → NodePort :30300)

### 3. Open the UI

**minikube**

```bash
minikube service llm-simulation-frontend -n llm-simulation
```

**kind / other clusters**

```bash
kubectl port-forward -n llm-simulation svc/llm-simulation-frontend 3000:80
# then open http://localhost:3000
```

**NodePort (if cluster nodes are reachable)**

```bash
NODE_IP=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[?(@.type=="InternalIP")].address}')
echo "http://${NODE_IP}:30300"
```

## Updating API keys

Re-run `configure-keys.sh` (or edit and reapply `api-keys.secret.yaml`), then
restart the backend pod so it picks up the new values:

```bash
kubectl rollout restart deployment/llm-simulation-backend -n llm-simulation
```

## Supported providers

| Provider | Key variable | Where to get a key |
|---|---|---|
| OpenAI | `OPENAI_API_KEY` | https://platform.openai.com/api-keys |
| Anthropic | `ANTHROPIC_API_KEY` | https://console.anthropic.com/settings/keys |
| Google Gemini | `GEMINI_API_KEY` | https://aistudio.google.com/app/apikey |
| Cohere | `COHERE_API_KEY` | https://dashboard.cohere.com/api-keys |
| Mistral | `MISTRAL_API_KEY` | https://console.mistral.ai/api-keys |

Keys that are absent from the Secret are silently skipped; the backend will
exclude unconfigured providers from `/api/providers`.

## Speedscale traffic capture

The Speedscale sidecar annotations required are:

```yaml
metadata:
  annotations:
    sidecar.speedscale.com/inject: "true"
    sidecar.speedscale.com/tls-out: "true"
```

### Traffic layers captured

| Layer | Service | Direction |
|---|---|---|
| Browser → nginx | `llm-simulation-nginx` | inbound (via port-forward on `lo`) |
| nginx → Frontend | `llm-simulation-frontend` | inbound (nginx pod IP as source) |
| Frontend → Backend | `llm-simulation-backend` | inbound (frontend pod IP as source) |
| Backend → LLM API | `llm-simulation-backend` | outbound |

### Accessing the app

Port-forward to the nginx service (not the frontend directly):

```bash
kubectl port-forward -n llm-simulation svc/llm-simulation-nginx 3000:80
# open http://localhost:3000
```

## Teardown

```bash
kubectl delete namespace llm-simulation
```
