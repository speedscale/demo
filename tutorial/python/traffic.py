"""Traffic driver for the tutorial orders service.

Usage: python traffic.py [baseURL]   (default http://localhost:8080)

Reads ../contract/traffic.json (override with TRAFFIC_FILE) and sends the
sequence described in ../contract/SPEC.md. Standard library only.
"""

import json
import os
import sys
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_FILE = os.path.join(HERE, "..", "contract", "traffic.json")

# Never use proxy environment variables: talk to the base URL directly.
opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
sent = 0
unexpected = 0


def call(base, method, path, want, body=None):
    """Send one request, report a status mismatch, return the parsed JSON body."""
    global sent, unexpected
    headers = {"Accept": "application/json", "User-Agent": "tutorial-traffic/1"}
    data = None
    if body is not None:
        data = json.dumps(body, separators=(",", ":")).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    try:
        with opener.open(req, timeout=10) as resp:
            status, raw = resp.status, resp.read()
    except urllib.error.HTTPError as exc:
        status, raw = exc.code, exc.read()
    sent += 1
    if status != want:
        unexpected += 1
        print(f"{method} {path}: got {status}, want {want}")
    try:
        return json.loads(raw)
    except ValueError:
        return None


def main():
    base = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080").rstrip("/")
    with open(os.environ.get("TRAFFIC_FILE") or DEFAULT_FILE) as f:
        cfg = json.load(f)

    call(base, "GET", "/healthz", 200)
    for _ in range(cfg["catalog_calls"]):
        call(base, "GET", "/catalog", 200)
    orders = cfg["orders"]
    for i in range(cfg["order_rounds"]):
        created = call(base, "POST", "/orders", 201, orders[i % len(orders)])
        order_id = created.get("id") if isinstance(created, dict) else None
        if not order_id:
            print(f"POST /orders: no id in response, skipping follow-up requests for round {i}")
            continue
        call(base, "GET", f"/orders/{order_id}", 200)
        call(base, "GET", f"/orders/{order_id}/status", 200)
    for _ in range(cfg["list_calls"]):
        call(base, "GET", "/orders", 200)
    for bad in cfg["bad_requests"]:
        call(base, bad["method"], bad["path"], bad["expect"], bad.get("body"))

    print(f"sent {sent} requests, {unexpected} unexpected")
    return 1 if unexpected else 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (urllib.error.URLError, OSError) as exc:
        print(f"request failed: {exc}", file=sys.stderr)
        sys.exit(1)
