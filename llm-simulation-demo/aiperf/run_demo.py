"""Capture the existing triage app, benchmark its workload, and test it offline."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request

from fixture_provider import FixtureProvider

ROOT = Path(__file__).resolve().parents[1]


def free_port():
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        return listener.getsockname()[1]


def wait_url(url, process):
    for _ in range(150):
        if process.poll() is not None:
            raise RuntimeError(f"Process exited before {url} became ready")
        try:
            with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(url, timeout=0.5):
                return
        except OSError:
            time.sleep(0.1)
    raise RuntimeError(f"Timed out waiting for {url}")


def stop(process):
    if process.poll() is None:
        process.send_signal(signal.SIGINT)
        try:
            process.wait(timeout=20)
        except subprocess.TimeoutExpired:
            process.terminate()
            process.wait(timeout=10)


def post(url, payload):
    request = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json"})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=90) as response:
        return json.load(response)


def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--proxymock", default="proxymock")
    parser.add_argument("--aiperf", default="aiperf")
    parser.add_argument("--out", type=Path)
    args = parser.parse_args()
    pm = shutil.which(args.proxymock)
    ap = shutil.which(args.aiperf)
    if not pm or not ap:
        parser.error("Install proxymock with AIPerf conversion support and aiperf==0.13.0")
    version = subprocess.check_output([ap, "--version"], text=True)
    if "0.13.0" not in version:
        parser.error("This rehearsal is pinned to aiperf==0.13.0")
    out = (args.out or ROOT / "aiperf" / "runs" / datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")).resolve()
    out.mkdir(parents=True, exist_ok=False)
    provider = FixtureProvider()
    provider.start()
    processes = []
    logs = []
    ports=set()
    while len(ports)<5:
        ports.add(free_port())
    tools_port, backend_port, inbound_port, proxy_port, health_port = sorted(ports)
    env = os.environ.copy()
    # The fixture key is deliberately fake. Clear unrelated provider keys in the child app.
    for key in ["ANTHROPIC_API_KEY", "GEMINI_API_KEY", "XAI_API_KEY", "COHERE_API_KEY", "MISTRAL_API_KEY"]:
        env.pop(key, None)
    env.update(OPENAI_API_KEY="fixture-only-no-credential", OPENAI_CHAT_URL=provider.origin+"/v1/chat/completions",
               TOOL_BASE_URL=f"http://127.0.0.1:{tools_port}", NO_PROXY="", no_proxy="", ENABLE_SIMULATION_MODE="false")

    def launch(name, command, cwd, child_env=env):
        log = (out / f"{name}.log").open("w")
        logs.append(log)
        process = subprocess.Popen([str(x) for x in command], cwd=cwd, env=child_env, stdout=log, stderr=subprocess.STDOUT)
        processes.append(process)
        return process

    def command(name, argv):
        print(name, flush=True)
        result = subprocess.run([str(x) for x in argv], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, timeout=180)
        (out / f"{name}.log").write_text(result.stdout)
        if result.returncode:
            raise RuntimeError(f"{name} failed; see {out / (name+'.log')}")
        return result.stdout

    app_cmd = [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(backend_port)]
    tickets = [{"provider": "openai", "model": "test-model", "input": {
        "ticket_id": ticket, "customer_tier": "enterprise", "transcript": "Checkout fails after an address update. Please investigate."}}
        for ticket in ["INC-4201", "INC-4204"]]
    try:
        tools = launch("tools", [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(tools_port)], ROOT / "tools-service")
        wait_url(f"http://127.0.0.1:{tools_port}/healthz", tools)
        captured = out / "recorded"
        record = launch("record", [pm, "record", "--app-port", backend_port, "--proxy-in-port", inbound_port,
                                   "--proxy-out-port", proxy_port, "--no-cert-install", "--out-format", "json", "--out", captured,
                                   "--app-health-endpoint", "/healthz", "--", *app_cmd], ROOT / "backend")
        wait_url(f"http://127.0.0.1:{backend_port}/healthz", record)
        baseline = [post(f"http://127.0.0.1:{inbound_port}/api/run", ticket) for ticket in tickets]
        assert all(not r["error"] and len(r["steps"]) == 3 for r in baseline), baseline
        stop(record)
        pairs = [json.loads(p.read_text()) for p in captured.rglob("*.json") if '"msgType"' in p.read_text()]
        inbound = [p for p in pairs if p.get("direction") == "IN"]
        outbound = [p for p in pairs if p.get("direction") == "OUT"]
        llm = [p for p in outbound if p["http"]["req"]["uri"] == "/v1/chat/completions"]
        tool_pairs = [p for p in outbound if p["http"]["req"]["uri"].startswith("/tools/")]
        assert len(inbound) == 2 and len(llm) == 6 and len(tool_pairs) == 4, (len(inbound), len(llm), len(tool_pairs))
        print("Captured 2 application requests, 6 inference calls and 4 tool calls.", flush=True)
        bundle = out / "aiperf-bundle"
        command("export", [pm, "export", "aiperf", "--in", captured, "--out", bundle, "--direction", "out", "--service", provider.origin.split("//")[1]])
        rows = [json.loads(line) for line in (bundle / "trace.jsonl").read_text().splitlines()]
        assert len(rows) == 6
        before = len(provider.requests)
        command("benchmark", [ap, "profile", "--model", "test-model", "--tokenizer", "builtin", "--input-file", bundle / "trace.jsonl",
                              "--custom-dataset-type", "mooncake_trace", "--url", provider.origin, "--endpoint-type", "chat", "--fixed-schedule",
                              "--request-count", "6", "--ui", "none", "--no-auto-plot", "--artifact-dir", out / "aiperf-results"])
        benchmark_wire = provider.requests[before:]
        assert Counter(map(canonical, benchmark_wire)) == Counter(canonical(r["payload"]) for r in rows)
        workload = out / "workload"
        command("import-requests", [pm, "import", "aiperf", bundle / "trace.jsonl", "--dataset-type", "mooncake_trace", "--base-url", provider.origin, "--out", workload])
        command("replay-requests", [pm, "replay", "--in", workload / "tests", "--test-against", provider.origin, "--out", out / "request-replay", "--no-cert-install"])
        verdict = json.loads((out / "request-replay" / "replay-verdict.json").read_text())
        assert verdict["verdict"] == "unmeasured" and verdict["summary"]["unmeasured"] == 6
        restored = out / "restored"
        command("import-bundle", [pm, "import", "aiperf", bundle, "--dataset-type", "mooncake_trace", "--base-url", provider.origin, "--out", restored])
        tool_mocks = out / "tool-mocks"
        tool_mocks.mkdir()
        for i, pair in enumerate(tool_pairs):
            (tool_mocks / f"{i:03}.json").write_text(json.dumps(pair))
        provider.stop()
        stop(tools)
        mock = launch("mock", [pm, "mock", "--in", restored / "mocks", "--in", tool_mocks, "--no-passthrough", "--no-cert-install",
                               "--proxy-out-port", proxy_port, "--health-port", health_port, "--out", out / "mocked", "--out-format", "json",
                               "--app-health-endpoint", f"http://127.0.0.1:{backend_port}/healthz", "--", *app_cmd], ROOT / "backend")
        wait_url(f"http://127.0.0.1:{health_port}", mock)
        wait_url(f"http://127.0.0.1:{backend_port}/healthz", mock)
        isolated = [post(f"http://127.0.0.1:{backend_port}/api/run", ticket) for ticket in tickets]
        assert [r["output"] for r in baseline] == [r["output"] for r in isolated], isolated
        assert all(not r["error"] and r["mocked"] for r in isolated), isolated
        stop(mock)
        observed = [json.loads(p.read_text()) for p in (out / "mocked").rglob("*.json") if '"msgType"' in p.read_text()]
        statuses = Counter(p.get("tags", {}).get("reactionMatch", str(p.get("responderMatch", "unknown"))) for p in observed)
        assert len(observed)==10 and statuses=={"HIT":10}, statuses
        report = {"application": "Existing support-triage backend", "provider": "Deterministic fixture, not a model benchmark",
                  "aiperfVersion": "0.13.0", "inboundRequests": 2, "capturedInferenceCalls": 6, "capturedToolCalls": 4,
                  "aiperfWireBodiesEqual": True, "standaloneAccuracy": "unmeasured", "isolatedOutputsEqual": True,
                  "dependenciesStoppedBeforeMocking": True, "mockedTransactions": len(observed), "mockStatusCounts": dict(statuses),
                  "datasetSha256": hashlib.sha256((bundle / "trace.jsonl").read_bytes()).hexdigest()}
        (out / "proof.json").write_text(json.dumps(report, indent=2)+"\n")
        (out / "app-outputs.json").write_text(json.dumps({"baseline": baseline, "isolated": isolated}, indent=2)+"\n")
        print(json.dumps(report, indent=2))
        print(f"Artifacts: {out}")
    finally:
        for process in reversed(processes):
            stop(process)
        if provider.thread.is_alive():
            provider.stop()
        for log in logs:
            log.close()

if __name__ == "__main__":
    main()
