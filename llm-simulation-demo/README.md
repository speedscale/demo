# LLM Simulation Demo

A self-contained demo app that shows why AI systems need more than prompt evals.
It lets you send support tickets through OpenAI, Anthropic, or Google Gemini and inject
real failure modes — provider timeouts, rate limits, schema drift, and tool failures —
to show what runtime validation for LLM systems actually looks like.

Built as a companion to the Speedscale blog post on LLM simulation.

## What it does

- Run a support-ticket triage task against any of three LLM providers
- Inject latency, 429 rate-limits, 500 tool errors, or malformed JSON with one toggle
- Watch the backend fall back from one provider to another
- Compare two runs side by side to see output drift, severity changes, and latency differences
- Inspect the full normalized envelope and tool-call sequence in the trace view
- Record and replay the entire workflow with Speedscale / proxymock

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14, TypeScript, Tailwind CSS |
| Backend | FastAPI (Python 3.11+), async httpx |
| Providers | OpenAI, Anthropic, Google Gemini |
| Tool simulation | Built-in fake order + policy endpoints |

## Local development (no Docker)

### 1. Backend

```bash
cd backend
cp .env.example .env          # fill in your API keys
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

OpenAPI docs available at http://localhost:8000/docs

### 2. Frontend

```bash
cd frontend
cp .env.local.example .env.local
npm install
npm run dev
```

Open http://localhost:3000

## Docker Compose

```bash
cp backend/.env.example .env   # set OPENAI_API_KEY etc.
docker compose up --build
```

Frontend: http://localhost:3000  
Backend: http://localhost:8000

## Kubernetes

See [`k8s/README.md`](k8s/README.md) for full instructions. Quick start:

```bash
# Supply API keys (creates the llm-api-keys Secret)
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
export GEMINI_API_KEY=AIza...
./k8s/configure-keys.sh

# Deploy everything
kubectl apply -k k8s/

# Open UI (minikube)
minikube service llm-simulation-frontend -n llm-simulation
```

## Environment variables

### Backend

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key |
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `GEMINI_API_KEY` | Google Gemini API key |
| `DEFAULT_PROVIDER` | Provider selected by default (`openai`) |
| `ENABLE_SIMULATION_MODE` | Enable simulation controls (`true`) |

### Frontend

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_API_BASE_URL` | Backend URL (`http://localhost:8000`) |

## API reference

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/run` | Execute one task |
| `GET` | `/api/providers` | List configured providers and models |
| `GET` | `/api/scenarios` | List built-in simulation scenarios |
| `POST` | `/api/scenarios/{id}/run` | Run a preset scenario |
| `GET` | `/api/runs` | List all recorded runs |
| `GET` | `/api/runs/{id}` | Fetch one recorded run |
| `GET` | `/tools/order/{order_id}` | Fake order lookup (injectable) |
| `GET` | `/tools/policy/{policy_id}` | Fake policy lookup (injectable) |
| `GET` | `/healthz` | Health check |

## Simulation scenarios

| ID | What it demonstrates |
|---|---|
| `baseline-ticket` | Happy path, no failures |
| `provider-timeout` | 3 s latency on Anthropic → fallback to OpenAI |
| `fallback-to-openai` | Anthropic 429 → retry with OpenAI |
| `malformed-tool-response` | Order tool returns schema-drifted JSON |
| `tool-failure` | Order tool returns 500 |

Run any scenario with:

```bash
curl -X POST http://localhost:8000/api/scenarios/fallback-to-openai/run | jq
```

## Speedscale / proxymock walkthrough

### Record a clean baseline run

```bash
# Start the backend behind the proxymock recorder
# (configure proxymock to listen on 8001 and forward to 8000)
proxymock record --port 8001 --target http://localhost:8000

# Run the baseline scenario through the proxy
curl -X POST http://localhost:8001/api/scenarios/baseline-ticket/run | jq
```

### Replay with providers mocked

```bash
proxymock replay --in-directory ./snapshots/baseline
```

### Replay with injected failures

```bash
proxymock replay --in-directory ./snapshots/baseline \
  --chaos inject_latency_ms=2000
```

### Compare baseline against changed provider

1. Run `baseline-ticket` and note the `request_id`
2. Run `fallback-to-openai` and note the second `request_id`
3. Open http://localhost:3000/compare?a=REQUEST_ID_1 and select the second run as B

The compare screen highlights every changed field — severity, provider, latency, and tool status.

## Project structure

```
llm-simulation-demo/
  README.md
  docker-compose.yml
  backend/
    Dockerfile
    requirements.txt
    .env.example
    app/
      main.py          # FastAPI app, routes, run logic
      tools.py         # Fake order + policy endpoints
      models/
        request.py
        result.py
        tool_call.py
      providers/
        base.py
        openai_adapter.py
        anthropic_adapter.py
        gemini_adapter.py
  frontend/
    Dockerfile
    package.json
    next.config.js
    src/
      app/
        page.tsx        # Main demo screen
        runs/page.tsx   # Run list
        runs/[id]/page.tsx  # Trace view
        compare/page.tsx    # Side-by-side comparison
      components/
        ResultCard.tsx
        SeverityBadge.tsx
        ToolCallList.tsx
      lib/
        api.ts
        types.ts
  scenarios/
    baseline-ticket.json
    provider-timeout.json
    malformed-tool-response.json
    fallback-to-openai.json
    tool-failure.json
```
