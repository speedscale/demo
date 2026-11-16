#!/usr/bin/env bash
# Print every response that changed versus the recording, field by field, plus any
# outbound call the app made that production never made (a mock MISS).
source "$(dirname "$0")/common.sh"
DIR="${1:-$(ls -td proxymock/results/replay-* | head -1)}"
MOCK="${DIR/replay-/mock-}"
python3 - "$DIR/replay-verdict.json" "$MOCK" <<'PY'
import json, sys, pathlib, re
v = json.load(open(sys.argv[1]))
bad = [p for p in v["pairs"] if p.get("match") != "pass" or p.get("bodyMatch") == "fail"]
print(f"INBOUND: {len(v['pairs']) - len(bad)}/{len(v['pairs'])} responses identical to the recording")
for p in sorted(bad, key=lambda p: p["endpoint"]):
    print(f"  {p['method']} {p['endpoint']}  status {p['recordedStatus']} -> {p['observedStatus']}")
    changes = p.get("bodyChanges", [])
    for c in changes[:3]:
        print(f"      {c['location'].replace('http.res.bodyBase64.', '')}: {c.get('baseline')} -> {c.get('candidate')}")
    if len(changes) > 3:
        print(f"      ... {len(changes) - 3} more fields")
misses = []
for f in sorted(pathlib.Path(sys.argv[2]).rglob("*.md")):
    t = f.read_text()
    if "match=MISS" in t:
        line = t.split("```")[1].strip().splitlines()[0]
        body = re.search(r"requestBodyJSON is (.*)", t)
        misses.append(f"  {line.rsplit(' ', 1)[0]}  {body.group(1) if body else ''}")
print(f"\nOUTBOUND calls production never made (mock MISS): {len(misses)}")
print("\n".join(misses))
PY
