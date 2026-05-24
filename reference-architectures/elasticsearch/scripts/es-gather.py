#!/usr/bin/env python3
"""es-gather.py — pull a subset of BYOC RRPair traffic from Elasticsearch and
write a proxymock-replayable directory.

This is the Elasticsearch sibling of `loki-gather.py` in the grafana/ scenario.
Output directory shape is identical, so `proxymock mock --in <dir>` reads it
without modification.

Usage:

    python3 es-gather.py \\
      --es-url   http://localhost:9200 \\
      --service  java-server \\
      --status   2.. \\
      --endpoint '^/spacex/.+' \\
      --start    -15m \\
      --out-dir  /tmp/spacex-snapshot

    proxymock mock --in /tmp/spacex-snapshot

Power-user mode bypasses the flag translation by passing a raw ES Query DSL
clause as JSON:

    python3 es-gather.py \\
      --es-url http://localhost:9200 \\
      --query  '{"bool":{"must":[{"term":{"Attributes.service.keyword":"java-server"}}]}}' \\
      --out-dir /tmp/x

Reference: see Linear S-11131 for the design + ES Query DSL → RRPair conversion
table. Companion to `loki-gather.py` in the grafana/ scenario.
"""

from __future__ import annotations

import argparse
import base64
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
import uuid as uuid_mod
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

# ─── time parsing ───────────────────────────────────────────────────────────


def parse_time(s: str, *, now: datetime | None = None) -> datetime:
    """Accept 'now', a relative offset like '-15m' / '-1h' / '-2d', or RFC3339."""
    now = now or datetime.now(timezone.utc)
    s = s.strip()
    if s in ("now", ""):
        return now
    m = re.fullmatch(r"-(\d+)([smhd])", s)
    if m:
        n, unit = int(m.group(1)), m.group(2)
        delta = {"s": timedelta(seconds=n), "m": timedelta(minutes=n), "h": timedelta(hours=n), "d": timedelta(days=n)}[unit]
        return now - delta
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        raise ValueError(f"can't parse time {s!r} — use 'now', '-15m'/'-2h'/'-1d', or RFC3339")


# ─── ES Query DSL construction ──────────────────────────────────────────────


def build_query(args: argparse.Namespace, start: datetime, end: datetime) -> dict:
    """Translate CLI flags into an ES Query DSL `bool` filter.

    The OTel-shipped index has this shape:

        _source.@timestamp           ingest time (used for range)
        _source.Resource.cluster     OTel resource attribute (correct)
        _source.Attributes.service   OTel attribute (correct)
        _source.Attributes.namespace OTel attribute (correct)
        _source.Body.{command,status,location,direction,uuid,...}
                                     the RRPair itself

    Body.cluster ships as the literal string "undefined" (S-11091); we
    overwrite from Resource.cluster after fetching.

    Note: keyword fields end in `.keyword` for exact-match term queries.
    Numeric and date fields don't have a .keyword suffix.
    """
    must: list[dict] = [
        {"range": {"@timestamp": {
            "gte": start.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "lte": end.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        }}},
    ]

    if args.query:
        # Power-user mode: parse the raw JSON and OR-merge with the time range.
        try:
            extra = json.loads(args.query)
        except json.JSONDecodeError as e:
            raise ValueError(f"--query must be valid JSON: {e}") from None
        return {"bool": {"must": must + [extra]}}

    # Filters on stream-like attributes — use term (exact match) on .keyword.
    for field, val in (
        ("Resource.cluster.keyword",    args.cluster),
        ("Attributes.service.keyword",  args.service),
        ("Attributes.namespace.keyword", args.namespace),
    ):
        if val:
            must.append({"term": {field: val}})

    # Filters on body fields — regex for status/method/endpoint (mirrors LogQL),
    # term for direction (an exact IN/OUT).
    if args.method:
        must.append({"regexp": {"Body.command.keyword": args.method}})
    if args.status:
        must.append({"regexp": {"Body.status.keyword": args.status}})
    if args.endpoint:
        must.append({"regexp": {"Body.location.keyword": args.endpoint}})
    if args.direction:
        must.append({"term": {"Body.direction.keyword": args.direction}})

    return {"bool": {"must": must}}


# ─── Elasticsearch query ────────────────────────────────────────────────────


def query_es(es_url: str, index: str, query: dict, limit: int) -> list[tuple[dict, dict, dict]]:
    """Single Search call against Elasticsearch.

    Returns a list of (resource, attributes, body) triples — one per matching
    document. `body` is the RRPair JSON object as the forwarder emitted it.

    Pagination beyond `limit` is a phase-2 improvement (Search After API).
    Today we trust the caller to keep windows reasonable (default 15m).
    """
    base = es_url.rstrip("/")
    api = f"{base}/{index}/_search"

    payload = json.dumps({
        "size": limit,
        "sort": [{"@timestamp": "desc"}],   # newest first; mirrors loki-gather
        "query": query,
    }).encode("utf-8")

    req = urllib.request.Request(
        api,
        data=payload,
        method="POST",
        headers={"Content-Type": "application/json"},
    )

    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body_resp = json.load(r)
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"ES returned HTTP {e.code}: {err_body[:300]}") from None
    except urllib.error.URLError as e:
        raise RuntimeError(f"can't reach ES at {api}: {e.reason}") from None

    if "error" in body_resp:
        raise RuntimeError(f"ES returned error: {body_resp['error']!r}")

    out: list[tuple[dict, dict, dict]] = []
    for hit in body_resp.get("hits", {}).get("hits", []):
        src = hit.get("_source", {})
        resource = src.get("Resource", {}) or {}
        attributes = src.get("Attributes", {}) or {}
        body = src.get("Body", {}) or {}
        if isinstance(body, dict):
            out.append((resource, attributes, body))
    return out


# ─── signature instance numbering ───────────────────────────────────────────


def _signature_key(sig: dict) -> tuple:
    """Stable comparison key for a signature map. Ignores any existing
    `instance` field so we re-number from scratch.
    """
    return tuple(sorted((k, v) for k, v in sig.items() if k != "instance"))


def assign_instances(records: list[tuple[dict, dict, dict]]) -> None:
    """Mutate each record's `body.signature` to include an `instance` value.

    See loki-gather.py for the rationale — proxymock's responder dedupes
    same-signature records via this field. ES path needs identical handling
    so a snapshot written by either script behaves identically downstream.
    """
    counts: dict[tuple, int] = {}
    for _r, _a, body in records:
        sig = body.get("signature")
        if not isinstance(sig, dict):
            continue
        key = _signature_key(sig)
        n = counts.get(key, 0)
        sig["instance"] = base64.b64encode(str(n).encode()).decode()
        counts[key] = n + 1


# ─── RRPair fixups + file writing ───────────────────────────────────────────


# body.cluster / body.namespace ship as "undefined" until S-11091 lands.
# Resource and Attributes from the OTel resource/attributes are correct,
# so copy them down. No-op once S-11091 is fixed.
_UNDEFINED_FROM_RESOURCE = {"cluster": "Resource"}
_UNDEFINED_FROM_ATTRIBUTES = {"namespace": "Attributes"}


def fix_record(body: dict, resource: dict, attributes: dict) -> dict:
    """Apply minimal fixups so the emitted RRPair matches what proxymock expects."""
    for field, _src in _UNDEFINED_FROM_RESOURCE.items():
        if body.get(field) in ("undefined", "", None):
            v = resource.get(field)
            if v:
                body[field] = v
    for field, _src in _UNDEFINED_FROM_ATTRIBUTES.items():
        if body.get(field) in ("undefined", "", None):
            v = attributes.get(field)
            if v:
                body[field] = v
    return body


def base64_uuid_to_str(b64: str) -> str:
    """RRPair UUIDs ship as 16-byte values base64-encoded; convert to
    hyphenated RFC-4122 form for the filename.
    """
    try:
        raw = base64.b64decode(b64, validate=False)
        if len(raw) == 16:
            return str(uuid_mod.UUID(bytes=raw))
    except (ValueError, TypeError):
        pass
    return str(uuid_mod.uuid4())


def write_rrpair(body: dict, snapshot_dir: Path) -> Path:
    """Write <snapshot_dir>/<host>/<uuid>.json. Same shape as loki-gather."""
    host = (body.get("http") or {}).get("req", {}).get("host") or "unknown-host"
    host = re.sub(r"[^A-Za-z0-9._-]", "_", host)
    uuid_str = base64_uuid_to_str(body.get("uuid", ""))
    host_dir = snapshot_dir / host
    host_dir.mkdir(parents=True, exist_ok=True)
    path = host_dir / f"{uuid_str}.json"
    path.write_text(json.dumps(body, separators=(",", ":")))
    return path


# ─── snapshot metadata ──────────────────────────────────────────────────────


def write_metadata(out_dir: Path, snapshot_id: str, query: dict, index: str,
                   start: datetime, end: datetime, count: int) -> None:
    """Write `.metadata/snapshot.json`. `source: elasticsearch` so downstream
    tooling can distinguish from a loki-gather snapshot."""
    meta = {
        "id":             snapshot_id,
        "name":           f"es-gather-{snapshot_id[:8]}",
        "source":         "elasticsearch",
        "analysisStatus": "none",
        "esIndex":        index,
        "esQuery":        query,
        "timeRange": {
            "start": start.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "end":   end.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        },
        "rrpairCount":    count,
        "createdAt":      datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "createdBy":      "es-gather.py",
    }
    meta_dir = out_dir / ".metadata"
    meta_dir.mkdir(parents=True, exist_ok=True)
    (meta_dir / "snapshot.json").write_text(json.dumps(meta, indent=2))


# ─── CLI ────────────────────────────────────────────────────────────────────


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="es-gather.py",
        description="Pull a subset of BYOC RRPair traffic from Elasticsearch and write a proxymock-replayable directory.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__.split("Usage:\n", 1)[1] if "Usage:" in (__doc__ or "") else None,
    )
    p.add_argument("--es-url",    required=True, help="Base URL of the Elasticsearch HTTP API (e.g. http://localhost:9200)")
    p.add_argument("--out-dir",   required=True, help="Output directory for the proxymock snapshot tree")

    p.add_argument("--index",     default="speedscale-rrpair", help="ES index to query. Default: speedscale-rrpair")
    p.add_argument("--start",     default="-15m", help="Window start: 'now', '-15m', '-2h', '-1d', or RFC3339. Default: -15m")
    p.add_argument("--end",       default="now",  help="Window end: same formats as --start. Default: now")
    p.add_argument("--limit",     type=int, default=5000, help="Max records per search call (ES has index.max_result_window cap, default 10000). Default: 5000")

    p.add_argument("--cluster",   help="Filter by Resource.cluster (exact match)")
    p.add_argument("--service",   help="Filter by Attributes.service (exact match)")
    p.add_argument("--namespace", help="Filter by Attributes.namespace (exact match)")
    p.add_argument("--method",    help='Filter by Body.command (HTTP method), regex (e.g. "GET", "POST|PUT")')
    p.add_argument("--status",    help='Filter by Body.status (HTTP status), regex (e.g. "200", "2..", "[45]..")')
    p.add_argument("--endpoint",  help='Filter by Body.location (URL path), regex (e.g. "^/api/.+")')
    p.add_argument("--direction", choices=("IN", "OUT"), help="Filter by Body.direction")

    p.add_argument("--query", help="Raw ES Query DSL JSON clause — combined with the time range, bypasses all other filter flags. For power users.")

    p.add_argument("--dry-run", action="store_true", help="Print the resolved query + window and exit without querying or writing")

    return p.parse_args()


def main() -> int:
    args = parse_args()

    try:
        start = parse_time(args.start)
        end   = parse_time(args.end)
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2

    try:
        query = build_query(args, start, end)
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2

    print(f"es-gather: {args.es_url}", file=sys.stderr)
    print(f"  index:  {args.index}", file=sys.stderr)
    print(f"  window: {start.isoformat()}  →  {end.isoformat()}  ({(end - start).total_seconds():.0f}s)", file=sys.stderr)
    print(f"  query:  {json.dumps(query, separators=(',', ':'))}", file=sys.stderr)

    if args.dry_run:
        print("dry run — exiting without querying ES", file=sys.stderr)
        return 0

    try:
        records = query_es(args.es_url, args.index, query, args.limit)
    except RuntimeError as e:
        print(f"error: {e}", file=sys.stderr)
        return 1

    if not records:
        print("no traffic matched filter; nothing written.", file=sys.stderr)
        print("hint: widen the time window, drop a filter, or use --dry-run to inspect the resolved query", file=sys.stderr)
        return 1

    for resource, attributes, body in records:
        fix_record(body, resource, attributes)
    assign_instances(records)

    out_dir = Path(args.out_dir).expanduser().resolve()
    snapshot_id = str(uuid_mod.uuid4())
    snapshot_dir = out_dir / f"snapshot-{snapshot_id}"
    snapshot_dir.mkdir(parents=True, exist_ok=True)

    written = 0
    hosts: dict[str, int] = {}
    for _r, _a, body in records:
        path = write_rrpair(body, snapshot_dir)
        host = path.parent.name
        hosts[host] = hosts.get(host, 0) + 1
        written += 1

    write_metadata(out_dir, snapshot_id, query, args.index, start, end, written)

    print(f"wrote {written} RRPairs to {snapshot_dir}", file=sys.stderr)
    for host, n in sorted(hosts.items(), key=lambda kv: -kv[1]):
        print(f"  {host}: {n}", file=sys.stderr)
    print("", file=sys.stderr)
    print(f"replay with:  proxymock mock --in {out_dir}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
