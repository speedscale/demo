# OTel Trace Replay Gate (Verified Minimal Example)

This scenario is a small example that has been validated with real commands in this repo.

It uses the `node/` demo service and shows:

1. Record production-shaped HTTP traffic through proxymock
2. Replay that traffic against a running app
3. Fail CI when replay checks fail

## Files in this example

```text
scenarios/otel-trace-replay-gate/
  README.md
  otel/collector-replay-candidates.yaml
  github-actions/replay-gate.yml
  run-example.sh
```

## Verified local run

From the repo root:

```bash
./scenarios/otel-trace-replay-gate/run-example.sh
```

What this script does:

- installs `node/` dependencies
- records inbound requests via `proxymock record` to a local temp directory
- sends real requests through proxymock inbound port (`http://localhost:4143`)
- replays the captured traffic with `proxymock replay`
- enforces explicit checks:
  - `requests.failed != 0`
  - `latency.p95 > 5000`

## CI gate template

Use `github-actions/replay-gate.yml` as a drop-in example for `.github/workflows/`.

It records-and-replays in the same job so there is no dependency on pre-committed snapshot files.

## OTel selection reference

`otel/collector-replay-candidates.yaml` shows a conceptual OTel processor setup for selecting replay candidates. It is a selection pattern reference, not a complete collector deployment.
