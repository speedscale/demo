# BYOC companion scripts

Small, single-file tools that pair with the BYOC + Grafana reference architecture. They live next to the manifests so anyone reading the demo can fork them without setting up a separate repo.

Pattern intent: as we add gather/replay scripts for other reference architectures (`elasticsearch/`, `fluent-bit/`), they move under each scenario's `scripts/` directory. Once a handful exist they get promoted to their own repo with proper packaging — for now this is the playground.

## `loki-gather.py`

Pull a subset of RRPair traffic from Loki and write a `proxymock`-replayable directory. The "gather" half of Speedscale Cloud's Create-Snapshot flow, sourced from Loki instead of the cloud's S3-backed snapshot store. Analysis is proxymock's job once the directory exists.

### Requirements

- Python 3.9+ (stdlib only — no `pip install`)
- A reachable Loki HTTP endpoint (typically `kubectl port-forward svc/loki 3101:3100` against the BYOC reference architecture)
- `proxymock` if you want to replay the result

### Usage

```bash
python3 loki-gather.py \
  --loki-url http://localhost:3101 \
  --start    -15m \
  --service  java-server \
  --status   2.. \
  --endpoint '^/spacex/.+' \
  --out-dir  /tmp/spacex-snapshot
```

This pulls the last 15 minutes of successful (`2xx`) inbound traffic to `java-server` matching `/spacex/.+`, and writes one `.json` file per RRPair under `/tmp/spacex-snapshot/snapshot-<uuid>/<host>/`.

### Filter flags (translated to LogQL)

| Flag | What it filters |
|---|---|
| `--cluster X` | Loki stream label |
| `--service X` | Loki stream label |
| `--namespace X` | Loki stream label |
| `--method GET` | HTTP method (regex) |
| `--status 2..` | HTTP status (regex) |
| `--endpoint '^/api/.+'` | URL path (regex) |
| `--direction IN\|OUT` | Capture direction |

For full LogQL control, pass `--logql '<your query>'` and the other filter flags are ignored.

### Output

```
<out-dir>/
├── .metadata/
│   └── snapshot.json              # synthesized: id, source=loki, time window, logql
└── snapshot-<uuid>/
    ├── java-server/
    │   ├── <rrpair-uuid>.json     # one file per RRPair (proto JSON form)
    │   └── ...
    └── <other-host>/
        └── ...
```

Same shape `speedctl proxymock cloud pull snapshot` produces after expanding a cloud snapshot — so anything downstream that reads either source works without modification.

### Replay with proxymock

After gathering, point proxymock at the directory:

```bash
proxymock mock --in /tmp/spacex-snapshot
```

Then route your app's outbound traffic through `localhost:4140` (the default proxymock proxy port) to get recorded responses.

**Workflow note**: `proxymock mock` answers your app's *outbound* calls — so the relevant records are `direction=OUT` ones (e.g. an app's call to `api.fiscaldata.treasury.gov`). If you want to *replay* inbound traffic against a service (e.g. exercise `java-server` with its recorded request stream), filter to `--direction IN` and use `proxymock replay` instead.

### Known gotchas

- **`body.cluster` workaround.** The forwarder ships `body.cluster: "undefined"` for every record today ([S-11091](https://linear.app/speedscale/issue/S-11091)). The script overwrites it with the Loki stream label `cluster` so downstream tools see the right cluster name. Same for `body.namespace`.
- **Signature `instance` numbers.** The cloud snapshot analyzer normally adds an `instance: N` field to each recorded signature so proxymock can deterministically dedupe replays of the same call. We skip the analyzer (by design), so the script assigns instance numbers itself by sorting records by Loki ingest order.
- **Loki cardinality cap (500 series).** The script's LogQL always pipes through `| keep <small-field-list>` after `| json`. A naïve `| json` extracts ~60 nested fields per record and blows past the cap on any aggregate query.
- **Port conflicts.** If your gathered set includes a Postgres or MySQL recording, `proxymock mock` will try to bind ports 5432 / 3306. Conflicts with anything local listening there. Filter to HTTP only (`--logql '{...} | json | body_l7protocol="http"'`) if needed.

### What's deliberately not here (yet)

- Markdown output (`--md`). `.json` is what proxymock expands cloud snapshots into, so the format is proven and easier. Markdown is more readable but requires base64-decoding bodies, recomposing the request line, joining header arrays — not worth doing twice if we end up promoting this to a real tool.
- Pagination / auto-windowing for large time ranges. Today, big windows can exhaust Loki's per-query limit; either narrow the window or use multiple invocations.
- Auth (`--bearer-token`, `--basic-auth`). The BYOC reference Loki has no auth. Add when needed.

See [S-11101](https://linear.app/speedscale/issue/S-11101) for the design history and the "phase 2 → speedctl integration" path.
