# Capture once, benchmark the requests, test the app offline

This rehearsal reuses the support-triage FastAPI backend and its order/policy service. Two tickets generate six inference calls and four tool calls. The script records actual application HTTP traffic, exports the inference requests to AIPerf, verifies the bodies AIPerf sends, imports the response-backed bundle, then runs the application with both dependency services stopped.

The default inference provider is an authored HTTP fixture, not a model. It needs no GPU or provider credentials. Its output demonstrates conversion and isolated application testing; its latency and throughput do not establish inference capacity or answer quality. The fixture omits token usage rather than inventing observed token counts.

## Run

From `llm-simulation-demo/`, with Python 3.12, uv, and a proxymock build supporting `export aiperf`:

```bash
uv venv --python 3.12 .venv
uv pip install --python .venv/bin/python \
  -r backend/requirements-dev.txt aiperf==0.13.0

.venv/bin/python aiperf/run_demo.py \
  --proxymock "$(command -v proxymock)" \
  --aiperf "$PWD/.venv/bin/aiperf"
```

The script uses ephemeral loopback ports and cleans up its processes. Output defaults to a new `aiperf/runs/<UTC timestamp>` directory, excluded from Git. `--out <new-directory>` selects another destination. Existing destinations are protected.

Read `proof.json` for the checked counts, request-body fidelity, unmeasured standalone accuracy and isolated output comparison. `app-outputs.json` retains the baseline and isolated application results. Command logs, original RRPairs, bundle manifest, AIPerf artifacts and observed mock transactions remain in that run directory.

The recording contains a fake fixture credential and fictional ticket/order data. It must not be mistaken for production evidence. Do not copy private recordings into a public example.

## What the rehearsal checks

The app is captured through proxymock's inbound proxy. Its outgoing HTTP calls use the wrapper's proxy environment. The capture must contain two app requests, six inference requests and four tool requests before export can continue.

AIPerf v0.13.0 loads the exported Mooncake payload records and sends exactly the same inference bodies, including generation settings. A request-only import remains unmeasured and creates no response-backed accuracy claim. The bundle import verifies its hashes and mapping, then restores inference responses. The original captured tool responses complete the dependency mocks. With passthrough disabled and both real dependency processes stopped, the app must produce the same output and all ten mock transactions must be hits.

Elapsed times, generated request IDs and the app's `mocked` indicator are not compared as application output. Model quality, real model throughput, absolute-arrival scheduling parity, streaming timing and any unreleased reliability-report integration are outside this check.

## Use a real inference service

The existing OpenAI adapter accepts `OPENAI_CHAT_URL`, the full chat-completions endpoint. Its normal default remains unchanged. For example, set `OPENAI_CHAT_URL=http://localhost:8002/v1/chat/completions` and provide `OPENAI_API_KEY` when starting the backend under `proxymock record`. Set the request's `model` to a model the service serves. The request includes JSON response format and a completion-token limit, so the target must support those settings.

Capture the application's requests before exporting. Use `--direction out`, the inference host/port in `--service`, and `--endpoint /v1/chat/completions` to select its LLM calls. Run AIPerf against the actual inference deployment and use a matching tokenizer when you need model-specific token counts. A model already present in a complete payload is retained; AIPerf's model flag does not rewrite it.

Review and mask prompts, response data and other sensitive fields with the existing DLP workflow before sharing an export. The fixture key and prompts used by the default rehearsal do not authorize access to a real provider.
