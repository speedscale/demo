# Support Triage Demo

A support ticket triage app built to demonstrate [Speedscale](https://speedscale.com) LLM simulation. The backend runs a 3-step AI pipeline on each ticket (classify → analyze → draft response) and calls out to a separate tools service for order data and policy lookups. You can run any of four LLM providers and compare their outputs side by side.

## When to use simulation

A mid-size support center running Claude Sonnet at 10K tickets/day spends around $180K/year on LLM API calls. Most of that isn't production traffic. It's engineers tweaking prompts, CI running the same tickets on every PR, and load tests that someone runs once and never again because it costs $400 each time.

| | Use real API |
|---|---|
| Production traffic | Yes |
| Prompt quality evals | Yes |
| Developing pipeline logic | No |
| CI / regression tests | No |
| Load testing | No |

Speedscale records one real run and replays it locally at any volume. The slider on the main page projects what the real bill would be at your ticket volume.

## How it works

```
                        ┌─────────────────────────────────────────────┐
                        │             Kubernetes Cluster              │
                        │                                             │
  Browser               │  ┌─────────┐    ┌──────────┐                │
    │                   │  │  nginx  │    │ frontend │                │
    │ :3000             │  │ (proxy) │───▶│ Next.js  │                │
    └──────────────────▶│  │         │    │          │                │
                        │  └─────────┘    └────┬─────┘                │
                        │   LoadBalancer       │ /api/*               │
                        │                      ▼                      │
                        │                ┌──────────┐                 │
                        │                │ backend  │                 │
                        │                │ FastAPI  │                 │
                        │                └──┬───┬───┘                 │
                        │          ┌────────┘   └─────────┐           │
                        │          ▼                      ▼           │
                        │  ┌───────────────┐    ┌───────────────────┐ │
                        │  │ tools-service │    │   LLM Providers   │ │
                        │  │  order lookup │    │                   │ │
                        │  │ policy lookup │    │  OpenAI  GPT-5.4   │ │
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
| OpenAI | `gpt-5.4-mini` | `OPENAI_API_KEY` |
| Anthropic | `claude-haiku-4-5` | `ANTHROPIC_API_KEY` |
| Google Gemini | `gemini-flash-latest` | `GEMINI_API_KEY` |
| xAI / Grok | `grok-4-1-fast-non-reasoning` | `XAI_API_KEY` |

You only need one key to run the demo. The "Analyze All" button runs all 20 sample tickets against whichever providers are configured.

## Running locally

All commands assume you are in the `llm-simulation-demo` directory.

### Prerequisites

- **Python 3.11+** and **pip** (virtual environments recommended)
- **Node.js 20+** and **npm**
- At least **one** provider API key (see [Providers](#providers)); the UI lists only configured providers

The app has three parts: **tools-service** (mock order/policy HTTP API), **backend** (FastAPI + LLM calls), and **frontend** (Next.js). Start them in that order in separate terminals.

### 1. Tools service (port 8001)

```bash
cd tools-service
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

Quick check: `curl -s http://127.0.0.1:8001/healthz`

### 2. Backend (port 8000)

```bash
cd backend
cp .env.example .env
# Edit .env: set API keys and TOOL_BASE_URL=http://127.0.0.1:8001
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The backend loads variables from `backend/.env` on startup (`python-dotenv`). You can still override any variable in your shell if you prefer.

Quick check: `curl -s http://127.0.0.1:8000/healthz` and `curl -s http://127.0.0.1:8000/api/providers`

### 3. Frontend (port 3000)

```bash
cd frontend
cp .env.local.example .env.local   # default BACKEND_URL matches native backend
npm install
npm run dev
```

Open **http://localhost:3000**. The browser talks to Next.js; server-side code proxies `/api/*` to `BACKEND_URL` (see `src/app/api/[...path]/route.ts`).

Automated tests (no real LLM calls) are described in [TESTING.md](TESTING.md).

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
