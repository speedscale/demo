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

## File overview

```
k8s/
  namespace.yaml                  # llm-simulation namespace
  config.yaml                     # ConfigMap — non-sensitive settings
  api-keys.secret.example.yaml    # Secret template — copy & fill in
  api-keys.secret.yaml            # Your actual keys — gitignored, never commit
  backend.yaml                    # Backend Deployment + ClusterIP Service
  frontend.yaml                   # Frontend Deployment + NodePort Service (+ Ingress stub)
  kustomization.yaml              # Kustomize root
  configure-keys.sh               # Helper: create Secret from env vars
  README.md                       # This file
```

## Runtime configuration (ConfigMap)

Edit `config.yaml` before deploying to change defaults:

| Key | Default | Description |
|---|---|---|
| `DEFAULT_PROVIDER` | `openai` | Provider selected by default in the UI |
| `ENABLE_SIMULATION_MODE` | `true` | Enable chaos/latency injection controls |
| `ENABLED_PROVIDERS` | `openai,anthropic,gemini` | Comma-separated list shown in the UI |

## Ingress (optional)

The `frontend.yaml` contains a commented-out Ingress resource. Uncomment and
set `spec.rules[0].host` to expose the demo on a stable hostname:

```bash
# Requires nginx-ingress or another ingress controller
kubectl apply -f frontend.yaml
```

## Teardown

```bash
kubectl delete namespace llm-simulation
```
