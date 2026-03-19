# Support Triage Demo

AI-powered customer support triage that runs a multi-step LLM pipeline across
multiple providers at scale — and shows how [Speedscale](https://speedscale.com)
simulation eliminates API costs during testing.

## Architecture

```
                        ┌─────────────────────────────────────────────┐
                        │             Kubernetes Cluster              │
                        │                                             │
  Browser               │  ┌─────────┐    ┌──────────┐                │
    │                   │  │  nginx  │    │ frontend │                │
    │ :3000             │  │ (proxy) │───▶│ Next.js  │                │
    └──────────────────▶│  │         │    │          │                │
                        │  └─────────┘    └────┬─────┘                │
                        │   LoadBalancer        │ /api/*              │
                        │                       ▼                     │
                        │                ┌──────────┐                 │
                        │                │ backend  │                 │
                        │                │ FastAPI  │                 │
                        │                └──┬───┬───┘                 │
                        │          ┌────────┘   └─────────┐           │
                        │          ▼                       ▼          │
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

Each ticket goes through a **3-step LLM pipeline**:

```
  Ticket ──▶ tools-service (order context + return policy)
               │
               ▼
  Step 1: Triage      classify severity (low / medium / high / critical)
  Step 2: Analysis    identify root cause, summarize impact
  Step 3: Response    draft customer reply, recommend next action
```

## What the demo shows

- **Real costs** — every run tracks tokens and USD cost per LLM call
- **Cross-provider comparison** — run all 20 sample tickets against every configured provider in parallel and compare how OpenAI, Anthropic, Gemini, and Grok differ in severity, root cause, and draft quality
- **Scale economics** — drag the "tickets per day" slider to your support volume and see annual LLM spend projected ($12K startup → $180K mid-size → $1.8M enterprise)
- **Simulation savings** — Speedscale captures the exact traffic pattern (ticket → tool calls → 3 LLM calls → response) and replays it at any scale for $0

## Providers

| Provider | Default model | Env variable |
|---|---|---|
| OpenAI | `gpt-4.1-mini` | `OPENAI_API_KEY` |
| Anthropic | `claude-haiku-4-5` | `ANTHROPIC_API_KEY` |
| Google Gemini | `gemini-flash-latest` | `GEMINI_API_KEY` |
| xAI / Grok | `grok-3-mini` | `XAI_API_KEY` |

Any combination of keys works — providers without a key are skipped in batch runs.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript |
| Backend | FastAPI (Python 3.11), async httpx |
| Tools service | FastAPI (Python 3.11) |
| Ingress | nginx reverse proxy |
| Orchestration | Kubernetes + kustomize |

## Local development (no Docker)

```bash
# Tools service (port 8001)
cd tools-service && pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001

# Backend (port 8000)
cd backend && cp .env.example .env   # add API keys
pip install -r requirements.txt
TOOL_BASE_URL=http://localhost:8001 uvicorn app.main:app --reload --port 8000

# Frontend (port 3000)
cd frontend && npm install
BACKEND_URL=http://localhost:8000 npm run dev
```

## Kubernetes

```bash
# Install API keys as a cluster secret
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export GEMINI_API_KEY=AIza...
export XAI_API_KEY=xai-...
./k8s/configure-keys.sh

# Deploy (public images)
./deploy-local.sh

# Minikube only: tunnel so localhost:3000 reaches the nginx LoadBalancer
./deploy-local.sh tunnel

# Rebuild from local source before deploying
BUILD=1 ./deploy-local.sh all
```

See [`k8s/README.md`](k8s/README.md) for Speedscale traffic capture setup.

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | — | OpenAI API key |
| `ANTHROPIC_API_KEY` | — | Anthropic API key |
| `GEMINI_API_KEY` | — | Google Gemini API key |
| `XAI_API_KEY` | — | xAI / Grok API key |
| `DEFAULT_PROVIDER` | `openai` | Default provider for single-ticket runs |
| `TOOL_BASE_URL` | `http://llm-simulation-tools` | Tools service base URL |
| `BACKEND_URL` | `http://localhost:8000` | Backend URL (frontend, server-side) |

## API reference

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/run` | Analyze one ticket (3-step pipeline) |
| `GET` | `/api/providers` | List configured providers and models |
| `GET` | `/api/runs` | List all recorded runs |
| `GET` | `/api/runs/{id}` | Fetch one recorded run |
| `GET` | `/tools/order/{order_id}` | Order details lookup (tools-service) |
| `GET` | `/tools/policy/{policy_id}` | Policy lookup (tools-service) |
| `GET` | `/healthz` | Health check |
