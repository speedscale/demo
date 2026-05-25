#!/usr/bin/env python3
"""gcs-gather.py — pull a subset of BYOC RRPair traffic from a GCS data-lake
bucket (written by the fluent-bit reference architecture) and assemble a
proxymock-replayable directory.

The bucket layout is Hive-style:

    gs://<bucket>/year=YYYY/month=MM/day=DD/hour=HH/<uuid>-<idx>.json.gz

Each object is gzipped NDJSON, one OTLP LogRecord per line, with the RRPair
body flattened to the top level (Fluent Bit's `s3` JSON output emits records
that way — different from the byoc-elasticsearch nested-Body shape).

Usage:

    python3 gcs-gather.py \\
      --bucket   speedscale-rrpair-demo \\
      --service  java-server \\
      --status   2.. \\
      --endpoint '^/spacex/.+' \\
      --start    -15m \\
      --out-dir  /tmp/spacex-snapshot

    proxymock mock --in /tmp/spacex-snapshot

Auth: shells out to `gcloud storage` so it inherits whatever credentials the
caller already has (ADC, gcloud login, Workload Identity, etc.). No Python
SDK dependency, matches the stdlib-only style of es-gather.py.

Companion to:
  - loki-gather.py  (grafana/        scenario, Loki LogQL)
  - es-gather.py    (elasticsearch/  scenario, ES Query DSL)
"""

from __future__ import annotations

import argparse
import base64
import gzip
import json
import re
import subprocess
import sys
import uuid as uuid_mod
from datetime import datetime, timedelta, timezone
from pathlib import Path


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
        delta = {"s": timedelta(seconds=n), "m": timedelta(minutes=n),
                 "h": timedelta(hours=n), "d": timedelta(days=n)}[unit]
        return now - delta
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        raise ValueError(
            f"can't parse time {s!r} — use 'now', '-15m'/'-2h'/'-1d', or RFC3339"
        )


# ─── partition enumeration ──────────────────────────────────────────────────


def hour_partitions(start: datetime, end: datetime) -> list[str]:
    """Return Hive-style prefix strings covering every hour the window touches.

    e.g. window 2026-05-25T14:55 → 2026-05-25T15:10 yields:
      ['year=2026/month=05/day=25/hour=14/',
       'year=2026/month=05/day=25/hour=15/']
    """
    start_h = start.replace(minute=0, second=0, microsecond=0)
    end_h = end.replace(minute=0, second=0, microsecond=0)
    out: list[str] = []
    cur = start_h
    while cur <= end_h:
        out.append(
            f"year={cur.year:04d}/month={cur.month:02d}/"
            f"day={cur.day:02d}/hour={cur.hour:02d}/"
        )
        cur += timedelta(hours=1)
    return out


def list_objects(bucket: str, prefix: str) -> list[str]:
    """`gcloud storage ls gs://<bucket>/<prefix>` — returns full gs:// paths.

    Returns [] if the prefix doesn't exist (no objects in that hour).
    """
    url = f"gs://{bucket}/{prefix}"
    try:
        proc = subprocess.run(
            ["gcloud", "storage", "ls", url],
            capture_output=True, text=True, check=False,
        )
    except FileNotFoundError:
        raise RuntimeError("gcloud CLI not found on PATH — install Google Cloud SDK")
    if proc.returncode != 0:
        stderr = proc.stderr.strip()
        if "NotFound" in stderr or "matched no objects" in stderr.lower():
            return []
        raise RuntimeError(f"gcloud storage ls failed: {stderr[:300]}")
    return [
        line.strip()
        for line in proc.stdout.splitlines()
        if line.strip().endswith(".json.gz")
    ]


def download_object(gs_url: str) -> bytes:
    """`gcloud storage cat` the object, return raw bytes (still gzipped)."""
    proc = subprocess.run(
        ["gcloud", "storage", "cat", gs_url],
        capture_output=True, check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(
            f"gcloud storage cat failed for {gs_url}: "
            f"{proc.stderr.decode('utf-8', errors='replace')[:300]}"
        )
    return proc.stdout


# ─── record filtering ───────────────────────────────────────────────────────


def regex_match(pattern: str | None, value) -> bool:
    if pattern is None:
        return True
    if value is None:
        return False
    return re.search(pattern, str(value)) is not None


def record_matches(rec: dict, args: argparse.Namespace) -> bool:
    """Filter a flat RRPair record against the CLI filter flags.

    The shape FB writes is flat: top-level keys are the body fields plus
    `@timestamp` and `__internal__`. Resource/Attributes metadata from OTLP
    lives under `__internal__.log_metadata.otlp.attributes`.
    """
    internal_attrs = (
        rec.get("__internal__", {})
           .get("log_metadata", {})
           .get("otlp", {})
           .get("attributes", {})
    )

    if args.service and rec.get("service") not in (args.service, None):
        if internal_attrs.get("service") != args.service:
            return False
    if args.namespace and rec.get("namespace") not in (args.namespace, None):
        if internal_attrs.get("namespace") != args.namespace:
            return False
    if args.cluster:
        cluster = (
            rec.get("cluster")
            or rec.get("__internal__", {})
                  .get("group_attributes", {})
                  .get("resource", {})
                  .get("attributes", {})
                  .get("cluster")
        )
        if cluster != args.cluster:
            return False

    if not regex_match(args.method, rec.get("command")):
        return False
    if not regex_match(args.status, rec.get("status")):
        return False
    if not regex_match(args.endpoint, rec.get("location")):
        return False
    if args.direction and rec.get("direction") != args.direction:
        return False

    return True


# ─── RRPair fixups ──────────────────────────────────────────────────────────


def fix_record(rec: dict) -> dict:
    """Strip Fluent Bit / OTLP envelope metadata, leaving the canonical
    RRPair body that proxymock expects to read.

    - Drop the `__internal__` wrapper (OTLP resource/scope/attributes).
    - Drop the FB-added `@timestamp` (the body already carries `ts`).
    - Backfill `cluster` from the OTLP resource attribute when the
      body's own `cluster` field shipped as "undefined" (forwarder
      bug — same one es-gather.py works around).
    - Backfill `namespace` from OTLP attributes the same way.
    """
    internal = rec.pop("__internal__", {}) or {}
    rec.pop("@timestamp", None)

    res_attrs = (internal.get("group_attributes", {})
                          .get("resource", {})
                          .get("attributes", {})) or {}
    otlp_attrs = (internal.get("log_metadata", {})
                          .get("otlp", {})
                          .get("attributes", {})) or {}

    if rec.get("cluster") in ("undefined", "", None) and res_attrs.get("cluster"):
        rec["cluster"] = res_attrs["cluster"]
    if rec.get("namespace") in ("undefined", "", None) and otlp_attrs.get("namespace"):
        rec["namespace"] = otlp_attrs["namespace"]

    return rec


# ─── signature instance numbering ───────────────────────────────────────────


def _signature_key(sig: dict) -> tuple:
    return tuple(sorted((k, v) for k, v in sig.items() if k != "instance"))


def assign_instances(records: list[dict]) -> None:
    """Mutate each record's `signature` to include an `instance` value.

    See loki-gather.py / es-gather.py for the rationale — proxymock's
    responder dedupes same-signature records via this field. All three
    gather scripts must number signatures identically so a snapshot
    written by any of them behaves the same downstream.
    """
    counts: dict[tuple, int] = {}
    for rec in records:
        sig = rec.get("signature")
        if not isinstance(sig, dict):
            continue
        key = _signature_key(sig)
        n = counts.get(key, 0)
        sig["instance"] = base64.b64encode(str(n).encode()).decode()
        counts[key] = n + 1


# ─── filename derivation + writing ──────────────────────────────────────────


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


def write_rrpair(rec: dict, snapshot_dir: Path) -> Path:
    """Write <snapshot_dir>/<host>/<uuid>.json — same layout as es-gather."""
    host = (rec.get("http") or {}).get("req", {}).get("host") or "unknown-host"
    host = re.sub(r"[^A-Za-z0-9._-]", "_", host)
    uuid_str = base64_uuid_to_str(rec.get("uuid", ""))
    host_dir = snapshot_dir / host
    host_dir.mkdir(parents=True, exist_ok=True)
    path = host_dir / f"{uuid_str}.json"
    path.write_text(json.dumps(rec, separators=(",", ":")))
    return path


# ─── snapshot metadata ──────────────────────────────────────────────────────


def write_metadata(out_dir: Path, snapshot_id: str, bucket: str,
                   start: datetime, end: datetime,
                   partitions: list[str], object_count: int,
                   rrpair_count: int) -> None:
    """Write `.metadata/snapshot.json`. `source: gcs` so downstream tooling
    can distinguish from a loki-gather / es-gather snapshot.
    """
    meta = {
        "id":             snapshot_id,
        "name":           f"gcs-gather-{snapshot_id[:8]}",
        "source":         "gcs",
        "analysisStatus": "none",
        "gcsBucket":      bucket,
        "gcsPartitions":  partitions,
        "objectCount":    object_count,
        "rrpairCount":    rrpair_count,
        "timeRange": {
            "start": start.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
            "end":   end.astimezone(timezone.utc).isoformat().replace("+00:00", "Z"),
        },
        "createdAt":      datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "createdBy":      "gcs-gather.py",
    }
    meta_dir = out_dir / ".metadata"
    meta_dir.mkdir(parents=True, exist_ok=True)
    (meta_dir / "snapshot.json").write_text(json.dumps(meta, indent=2))


# ─── CLI ────────────────────────────────────────────────────────────────────


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        prog="gcs-gather.py",
        description="Pull a subset of BYOC RRPair traffic from a fluent-bit-written "
                    "GCS data-lake bucket and write a proxymock-replayable directory.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__.split("Usage:\n", 1)[1] if "Usage:" in (__doc__ or "") else None,
    )
    p.add_argument("--bucket",  required=True, help="GCS bucket name (no gs:// prefix)")
    p.add_argument("--out-dir", required=True, help="Output directory for the proxymock snapshot tree")

    p.add_argument("--start",   default="-15m", help="Window start: 'now', '-15m', '-2h', '-1d', or RFC3339. Default: -15m")
    p.add_argument("--end",     default="now",  help="Window end: same formats as --start. Default: now")

    p.add_argument("--cluster",   help="Filter by cluster name (exact match)")
    p.add_argument("--service",   help="Filter by service name (exact match)")
    p.add_argument("--namespace", help="Filter by k8s namespace (exact match)")
    p.add_argument("--method",    help='Filter by HTTP method, regex (e.g. "GET", "POST|PUT")')
    p.add_argument("--status",    help='Filter by HTTP status, regex (e.g. "200", "2..", "[45]..")')
    p.add_argument("--endpoint",  help='Filter by URL path, regex (e.g. "^/api/.+")')
    p.add_argument("--direction", choices=("IN", "OUT"), help="Filter by traffic direction")

    p.add_argument("--dry-run", action="store_true", help="List partitions + matching objects without downloading or writing")

    return p.parse_args()


def main() -> int:
    args = parse_args()

    try:
        start = parse_time(args.start)
        end = parse_time(args.end)
    except ValueError as e:
        print(f"error: {e}", file=sys.stderr)
        return 2

    partitions = hour_partitions(start, end)
    print(f"gcs-gather: gs://{args.bucket}", file=sys.stderr)
    print(f"  window:     {start.isoformat()}  →  {end.isoformat()}  "
          f"({(end - start).total_seconds():.0f}s)", file=sys.stderr)
    print(f"  partitions: {len(partitions)} hour(s)", file=sys.stderr)
    for p in partitions:
        print(f"    {p}", file=sys.stderr)

    # Enumerate objects in each partition
    all_objs: list[str] = []
    for prefix in partitions:
        try:
            objs = list_objects(args.bucket, prefix)
        except RuntimeError as e:
            print(f"error: {e}", file=sys.stderr)
            return 1
        all_objs.extend(objs)
    print(f"  objects:    {len(all_objs)}", file=sys.stderr)

    if args.dry_run:
        for o in all_objs:
            print(f"    {o}", file=sys.stderr)
        print("dry run — exiting without downloading", file=sys.stderr)
        return 0

    if not all_objs:
        print("no objects found in window; nothing written.", file=sys.stderr)
        print("hint: widen --start, or check that the bucket is receiving traffic", file=sys.stderr)
        return 1

    # Stream every object, gunzip, parse NDJSON, filter
    matched: list[dict] = []
    for gs_url in all_objs:
        try:
            raw = download_object(gs_url)
        except RuntimeError as e:
            print(f"warning: {e}", file=sys.stderr)
            continue
        try:
            data = gzip.decompress(raw)
        except OSError:
            data = raw  # not gzipped — uncompressed fallback
        for line in data.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if not isinstance(rec, dict):
                continue
            if not record_matches(rec, args):
                continue
            matched.append(rec)

    if not matched:
        print("no traffic matched filters; nothing written.", file=sys.stderr)
        print("hint: drop a filter or widen --start to inspect what's in the bucket", file=sys.stderr)
        return 1

    # Apply RRPair fixups + signature numbering
    for rec in matched:
        fix_record(rec)
    assign_instances(matched)

    # Write snapshot tree
    out_dir = Path(args.out_dir).expanduser().resolve()
    snapshot_id = str(uuid_mod.uuid4())
    snapshot_dir = out_dir / f"snapshot-{snapshot_id}"
    snapshot_dir.mkdir(parents=True, exist_ok=True)

    hosts: dict[str, int] = {}
    written = 0
    for rec in matched:
        path = write_rrpair(rec, snapshot_dir)
        host = path.parent.name
        hosts[host] = hosts.get(host, 0) + 1
        written += 1

    write_metadata(out_dir, snapshot_id, args.bucket, start, end,
                   partitions, len(all_objs), written)

    print(f"wrote {written} RRPairs to {snapshot_dir}", file=sys.stderr)
    for host, n in sorted(hosts.items(), key=lambda kv: -kv[1]):
        print(f"  {host}: {n}", file=sys.stderr)
    print("", file=sys.stderr)
    print(f"replay with:  proxymock mock --in {out_dir}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
