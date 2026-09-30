#!/usr/bin/env python3
"""Reduce a proxymock recording of the tutorial app to its shape, and compare shapes.

A port conforms when its recording, driven by its traffic driver against an
empty database, has the same shape as the Go reference in shape.txt:

  * inbound requests: method, path (order ids masked), status, request body
    and response body with the planted noise masked
  * outbound HTTP: method, host, path (the ts query value masked), status and
    the headers the contract names
  * SQL: how many times each statement ran

Driver housekeeping (startup, session SETs, Sync, Close and the like) is left
out because it differs by language and the contract says nothing about it.

Usage:
  python shape.py RECORDING_DIR              print the shape
  python shape.py RECORDING_DIR --check FILE exit 1 and print a diff if it differs
  python shape.py RECORDING_DIR --write FILE write the shape to FILE

RECORDING_DIR is a `proxymock record --out` directory in either format.
Markdown recordings are converted to JSON in a temporary copy with
`proxymock files convert`, so proxymock must be on PATH for those.
"""

import argparse
import base64
import collections
import difflib
import glob
import gzip
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

UUID = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
UUID_IN_PATH = re.compile(r"[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}")
TIMESTAMP = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$")
# The fixed not-found id in traffic.json is data, not noise.
FIXED_IDS = {"00000000-0000-4000-8000-000000000000"}

# The statements from SPEC.md, keyed by how proxymock normalizes them.
STATEMENT_NAMES = {
    "INSERT INTO orders": "S1",
    "INSERT INTO order_items": "S2",
    "SELECT id, customer, status, total_cents, created_at FROM orders WHERE id": "S3",
    "SELECT project_id, name, quantity, unit_price_cents FROM order_items": "S4",
    "SELECT id, customer, status, total_cents, created_at FROM orders WHERE created_at": "S5",
    "SELECT o.id": "S6",
    "SELECT status FROM orders": "S7",
}
TRANSACTION = {"BEGIN", "COMMIT", "ROLLBACK", "START TRANSACTION"}


def load_pairs(recording):
    if glob.glob(os.path.join(recording, "**", "*.md"), recursive=True):
        tmp = tempfile.mkdtemp(prefix="tutorial-shape-")
        copy = os.path.join(tmp, "rec")
        shutil.copytree(recording, copy)
        subprocess.run(
            ["proxymock", "files", "convert", "--in", copy, "--out-format", "json"],
            check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        recording = copy
    pairs = []
    for path in glob.glob(os.path.join(recording, "**", "*.json"), recursive=True):
        with open(path, encoding="utf-8") as f:
            try:
                pair = json.load(f)
            except json.JSONDecodeError:
                continue
        if isinstance(pair, dict) and pair.get("msgType") == "rrpair":
            pairs.append(pair)
    return pairs


def body(msg):
    raw = msg.get("bodyBase64")
    if raw:
        data = base64.b64decode(raw)
        if data[:2] == b"\x1f\x8b":
            data = gzip.decompress(data)
    else:
        data = (msg.get("body") or "").encode()
    if not data.strip():
        return None
    try:
        return json.loads(data)
    except ValueError:
        return "<non-json>"


def mask(value, path=""):
    """Replace the planted noise with placeholders, keeping key order."""
    if isinstance(value, dict):
        return {k: mask(v, k) for k, v in value.items()}
    if isinstance(value, list):
        if path == "orders":
            # GET /orders lists whatever is in the database from the last
            # hour; only the shape of one entry is stable.
            return [mask(value[0])] if value else []
        return [mask(v) for v in value]
    if isinstance(value, str):
        if UUID.match(value) and value not in FIXED_IDS:
            return "<uuid>"
        if TIMESTAMP.match(value):
            return "<timestamp>"
    return value


def compact(value):
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


def path_of(url):
    return UUID_IN_PATH.sub(lambda m: m.group(0) if m.group(0) in FIXED_IDS else "{id}", url)


def header(msg, name):
    for k, v in (msg.get("headers") or {}).items():
        if k.lower() == name.lower():
            return v[0] if v else ""
    return None


def http_line(pair):
    req = pair["http"]["req"]
    res = pair["http"]["res"]
    status = res.get("statusCode")
    if pair.get("direction") == "IN":
        url = path_of(req.get("url") or req.get("uri") or pair.get("location", ""))
        line = f"IN  {req.get('method')} {url} -> {status}"
        req_body = body(req)
        if req_body is not None:
            line += f" req={compact(req_body)}"
        return line + f" res={compact(mask(body(res)))}"
    url = req.get("url") or ""
    url = re.sub(r"^https?://[^/]+", "", url)
    url = re.sub(r"([?&]ts=)\d+", r"\g<1><ms>", url)
    request_id = header(req, "X-Request-Id")
    request_id = "<uuid>" if request_id and UUID.match(request_id) else request_id
    return (
        f"OUT {req.get('method')} {req.get('host', '').split(':')[0]}{url} -> {status}"
        f" accept={header(req, 'Accept')} user-agent={header(req, 'User-Agent')} x-request-id={request_id}"
    )


def statement_name(sql):
    for prefix, name in STATEMENT_NAMES.items():
        if sql.startswith(prefix):
            return name
    return None


def sql_line(pair):
    """One line per statement execution, None for driver housekeeping."""
    command = pair.get("command")
    sql = " ".join((pair.get("location") or "").split())
    if command == "Query" and sql.upper() in TRANSACTION:
        return f"SQL {sql.upper()}"
    if command not in ("Execute Prepared Statement", "Query"):
        return None
    if sql.upper() in TRANSACTION:
        return f"SQL {sql.upper()}"
    name = statement_name(sql)
    return f"SQL {name}" if name else None


def shape(recording):
    counts = collections.Counter()
    for pair in load_pairs(recording):
        proto = pair.get("l7protocol")
        if proto in ("http", "https") and "http" in pair:
            counts[http_line(pair)] += 1
        elif proto == "postgres":
            line = sql_line(pair)
            if line:
                counts[line] += 1
    return "".join(f"{n:4d}  {line}\n" for line, n in sorted(counts.items()))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("recording")
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--check", metavar="FILE")
    group.add_argument("--write", metavar="FILE")
    args = parser.parse_args()

    got = shape(args.recording)
    if args.write:
        with open(args.write, "w", encoding="utf-8") as f:
            f.write(got)
        return 0
    if not args.check:
        sys.stdout.write(got)
        return 0
    with open(args.check, encoding="utf-8") as f:
        want = f.read()
    if got == want:
        print("conforms")
        return 0
    sys.stdout.writelines(difflib.unified_diff(
        want.splitlines(True), got.splitlines(True), fromfile=args.check, tofile=args.recording))
    return 1


if __name__ == "__main__":
    sys.exit(main())
