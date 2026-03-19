# Support Triage Demo

A support ticket triage app built to demonstrate [Speedscale](https://speedscale.com) LLM simulation. The backend runs a 3-step AI pipeline on each ticket (classify → analyze → draft response) and calls out to a separate tools service for order data and policy lookups. You can run any of four LLM providers and compare their outputs side by side.

## The simulation angle

Every run against a real LLM costs money. At support-center scale that adds up fast — $180K/year for a mid-size operation running Claude Sonnet. Most of that spend isn't production traffic; it's developers iterating on prompts, CI pipelines running regression tests, and load tests validating scale. None of that needs to hit a real API.

| When | Pay real tokens? | Why |
|---|---|---|
| Production — live customer tickets | Yes | Real customers need real responses |
| Prompt evals — measuring output quality | Yes | You need authentic model output to score |
| Development — iterating on pipeline logic | No | You're testing code paths, not the LLM |
| CI / regression tests | No | Deterministic replays are faster and free |
| Load testing | No | Would cost hundreds of dollars per run |

Speedscale captures one real run — paying for tokens once — then replays that traffic at any volume without touching the API again. The slider on the main page shows what the bill would be at your actual ticket volume.

## How it works

```
                        ┌─────────────────────────────────────────────┐
                        │             Kubernetes Cluster              │
                        │                                             │
  Browser               │  ┌─────────┐    ┌──────────┐               │
    │                   │  │  nginx  │    │ frontend │               │
    │ :3000             │  │ (proxy) │───▶│ Next.js  │               │
    └──────────────────▶│  │         │    │          │               │
                        │  └─────────┘    └────┬─────┘               │
                        │   LoadBalancer        │ /api/*              │
                        │                       ▼                     │
                        │                ┌──────────┐                 │
                        │                │ backend  │                 │
                        │                │ FastAPI  │                 │
                        │                └──┬───┬───┘                 │
                        │          ┌────────┘   └─────────┐           │
                        │          ▼                       ▼           │
                        │  ┌───────────────┐    ┌───────────────────┐ │
                        │  │ tools-service │    │   LLM Providers   │ │
                        │  │  order lookup │    │                   │ │
                        │  │ policy lookup │    │  OpenAI  GPT-4    │ │
                        │  └───────────────┘    │  Anthropic Claude │ │
                        │                       │  Google Gemini    │ │
                        │                       │  xAI / Grok       │ │
                        │                       └───────────────────┘ │
                        └─────────────────────────────────────────────┘
```

For each ticket, the backend first fetches order context and the return policy from the tools service in parallel, then runs three sequential LLM calls:

```
  Step 1: Triage      what's the severity and category?
  Step 2: Analysis    root cause, customer impact, investigation steps
  Step 3: Response    draft the customer reply and recommended action
```

The tools service adds realistic latency (80–220ms for order lookups, 15–60ms for policy) so the captured traffic looks like real production traffic when replayed.

## Providers

| Provider | Default model | Key |
|---|---|---|
| OpenAI | `gpt-4.1-mini` | `OPENAI_API_KEY` |
| Anthropic | `claude-haiku-4-5` | `ANTHROPIC_API_KEY` |
| Google Gemini | `gemini-flash-latest` | `GEMINI_API_KEY` |
| xAI / Grok | `grok-3` | `XAI_API_KEY` |

You only need one key to run the demo. The "Analyze All" button runs all 20 sample tickets against whichever providers are configured.

## Running locally

```bash
# tools service
cd tools-service && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001

# backend
cd backend && cp .env.example .env   # add your API keys
pip install -r requirements.txt
TOOL_BASE_URL=http://localhost:8001 uvicorn app.main:app --reload --port 8000

# frontend
cd frontend && npm install
BACKEND_URL=http://localhost:8000 npm run dev
```

## Kubernetes

```bash
# create the API key secret
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export GEMINI_API_KEY=AIza...
export XAI_API_KEY=xai-...
./k8s/configure-keys.sh

# deploy using public images
./deploy-local.sh

# minikube only: expose the nginx LoadBalancer on localhost:3000
./deploy-local.sh tunnel

# rebuild images from local source and redeploy
BUILD=1 ./deploy-local.sh all
```

See [`k8s/README.md`](k8s/README.md) for Speedscale traffic capture setup.

## Config

| Variable | Default | Notes |
|---|---|---|
| `OPENAI_API_KEY` | — | |
| `ANTHROPIC_API_KEY` | — | |
| `GEMINI_API_KEY` | — | |
| `XAI_API_KEY` | — | |
| `DEFAULT_PROVIDER` | `openai` | |
| `TOOL_BASE_URL` | `http://llm-simulation-tools` | override for local dev |
| `BACKEND_URL` | `http://localhost:8000` | used by the frontend server-side |

## API

| Method | Path | |
|---|---|---|
| `POST` | `/api/run` | run the 3-step pipeline on one ticket |
| `GET` | `/api/providers` | list providers and which are configured |
| `GET` | `/api/runs` | run history |
| `GET` | `/api/runs/{id}` | single run detail |
| `GET` | `/tools/order/{order_id}` | tools-service |
| `GET` | `/tools/policy/{policy_id}` | tools-service |
| `GET` | `/healthz` | |
