# Support Triage Demo

An AI-powered customer support triage application that demonstrates running a
multi-step LLM pipeline across multiple providers at scale — and how
[Speedscale](https://speedscale.com) simulation eliminates API costs during
testing and load validation.

## Architecture

```
                        ┌─────────────────────────────────────────────┐
                        │             Kubernetes Cluster               │
                        │                                              │
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
                        │  ┌───────────────┐    ┌──────────────────┐  │
                        │  │ tools-service │    │   LLM Providers  │  │
                        │  │  order lookup │    │                  │  │
                        │  │ policy lookup │    │ ┌──────────────┐ │  │
                        │  └───────────────┘    │ │ OpenAI GPT-4 │ │  │
                        │                       │ ├──────────────┤ │  │
                        │                       │ │  Anthropic   │ │  │
                        │                       │ │    Claude    │ │  │
                        │                       │ ├──────────────┤ │  │
                        │                       │ │   Google     │ │  │
                        │                       │ │   Gemini     │ │  │
                        │                       │ ├──────────────┤ │  │
                        │                       │ │  xAI / Grok  │ │  │
                        │                       │ └──────────────┘ │  │
                        │                       └──────────────────┘  │
                        └─────────────────────────────────────────────┘
```

Each support ticket goes through a **3-step LLM pipeline**:

```
  Ticket
    │
    ├─ tools-service ──▶ order context + return policy
    │
    ▼
  Step 1: Triage      classify severity (low / medium / high / critical)
    │
    ▼
  Step 2: Analysis    identify root cause, summarize impact
    │
    ▼
  Step 3: Response    draft customer reply, recommend next action
```

## What the demo shows

- **Real costs** — every analysis tracks tokens consumed and USD cost per LLM call
- **Cross-provider comparison** — run all 20 sample tickets against every configured
  provider in parallel; compare how OpenAI, Anthropic, Gemini, and Grok differ in
  severity classification, root cause, and draft quality
- **Scale economics** — drag the "tickets per day" slider to your support volume and
  see what the annual LLM spend projects to ($12K for a startup, $180K for a
  mid-size operation, $1.8M for enterprise scale)
- **Simulation savings** — Speedscale captures the exact traffic pattern (ticket →
  tool calls → 3 LLM calls → structured response) and replays it at any scale for $0

## Providers

| Provider | Default model | Env variable |
|---|---|---|
| OpenAI | `gpt-4.1-mini` | `OPENAI_API_KEY` |
| Anthropic | `claude-haiku-4-5` | `ANTHROPIC_API_KEY` |
| Google Gemini | `gemini-flash-latest` | `GEMINI_API_KEY` |
| xAI / Grok | `grok-3-mini` | `XAI_API_KEY` |

Any combination of keys works — providers without a key are shown as unconfigured
and skipped in batch runs.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript |
| Backend | FastAPI (Python 3.11), async httpx |
| Tools service | FastAPI (Python 3.11) |
| Ingress | nginx reverse proxy |
| Orchestration | Kubernetes + kustomize |

## Local development (no Docker)

### Tools service

```bash
cd tools-service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

### Backend

```bash
cd backend
cp .env.example .env      # add your API keys
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
TOOL_BASE_URL=http://localhost:8001 uvicorn app.main:app --reload --port 8000
```

OpenAPI docs: http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
BACKEND_URL=http://localhost:8000 npm run dev
```

Open http://localhost:3000

## Kubernetes (local cluster)

```bash
# 1. Install API keys as a cluster secret
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export GEMINI_API_KEY=AIza...
export XAI_API_KEY=xai-...
./k8s/configure-keys.sh

# 2. Deploy everything (public images)
./deploy-local.sh

# 3. Minikube only: start tunnel so localhost:3000 reaches the nginx LoadBalancer
./deploy-local.sh tunnel
```

To deploy from local source (e.g. after changing frontend code):

```bash
BUILD=1 ./deploy-local.sh all        # rebuild all images then redeploy
BUILD=1 ./deploy-local.sh frontend   # rebuild frontend only
```

See [`k8s/README.md`](k8s/README.md) for Speedscale capture setup.

## Environment variables

### Backend

| Variable | Default | Description |
|---|---|---|
| `OPENAI_API_KEY` | — | OpenAI API key |
| `ANTHROPIC_API_KEY` | — | Anthropic API key |
| `GEMINI_API_KEY` | — | Google Gemini API key |
| `XAI_API_KEY` | — | xAI / Grok API key |
| `DEFAULT_PROVIDER` | `openai` | Provider used for single-ticket runs |
| `ENABLED_PROVIDERS` | `openai,anthropic,gemini,xai` | Comma-separated list |
| `TOOL_BASE_URL` | `http://llm-simulation-tools` | Tools service base URL |

### Frontend

| Variable | Default | Description |
|---|---|---|
| `BACKEND_URL` | `http://localhost:8000` | Backend base URL (server-side) |

## API reference

### Backend (`/api/...`)

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/run` | Analyze one ticket (3-step pipeline) |
| `GET` | `/api/providers` | List configured providers and models |
| `GET` | `/api/runs` | List all recorded runs |
| `GET` | `/api/runs/{id}` | Fetch one recorded run |
| `GET` | `/healthz` | Health check |

### Tools service (`/tools/...`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/tools/order/{order_id}` | Order details lookup |
| `GET` | `/tools/policy/{policy_id}` | Return/SLA policy lookup |
| `GET` | `/healthz` | Health check |

## Project structure

```
llm-simulation-demo/
  README.md
  deploy-local.sh         # local cluster deploy + BUILD=1 image rebuild
  docker-compose.yml
  backend/
    Dockerfile
    requirements.txt
    app/
      main.py             # FastAPI routes, 3-step pipeline orchestration
      models/             # Pydantic request/response models
      providers/
        base.py           # shared prompts, pricing, AdapterResult
        openai_adapter.py
        anthropic_adapter.py
        gemini_adapter.py
        xai_adapter.py    # Grok (reuses OpenAI-compatible API)
  tools-service/
    Dockerfile
    requirements.txt
    Makefile
    app/
      main.py             # order + policy lookup endpoints
  frontend/
    Dockerfile
    package.json
    src/
      app/
        page.tsx          # ticket triage dashboard + cost story
        runs/             # run history + trace view
        compare/          # side-by-side provider comparison
      components/
        NavBar.tsx        # session cost meter
        ResultCard.tsx
        SeverityBadge.tsx
      lib/
        api.ts
        types.ts
  k8s/
    kustomization.yaml
    namespace.yaml
    config.yaml           # ConfigMap
    backend.yaml
    frontend.yaml
    tools.yaml            # tools-service deployment
    nginx.yaml            # ingress proxy (LoadBalancer on :3000)
    configure-keys.sh     # creates llm-api-keys Secret
    README.md             # Speedscale capture instructions
```
