# BYOC + Elasticsearch companion scripts

Small, single-file tools that pair with the BYOC + Elasticsearch reference architecture. Same pattern as `../../grafana/scripts/`: live next to the manifests so anyone reading the demo can fork them without setting up a separate repo. Promoted to their own repo once a handful exist.

## `es-gather.py`

Pull a subset of RRPair traffic from Elasticsearch and write a `proxymock`-replayable directory. The "gather" half of Speedscale Cloud's Create-Snapshot flow, sourced from Elasticsearch instead of the cloud's S3 snapshot store. Analysis is proxymock's job once the directory exists.

Sibling of `loki-gather.py` — same CLI shape, same output shape, different backend.

### Requirements

- Python 3.9+ (stdlib only — no `pip install`)
- A reachable Elasticsearch HTTP endpoint. With the BYOC reference architecture ES is `Service: NodePort` on `30032`, so `http://$(minikube ip):30032` (or `http://<node-ip>:30032` on a real cluster) works without a `kubectl port-forward`. On `minikube --driver=docker` on macOS, route it via Docker Desktop host networking, a non-docker driver, or the `elasticsearch-bridge` socat container that `speedstack/infra/minikube/speedscale-operator/install.sh` brings up at `localhost:9200`.
- `proxymock` if you want to replay the result

### Usage

```bash
python3 es-gather.py \
  --es-url   http://$(minikube ip):30032 \
  --start    -15m \
  --service  java-server \
  --status   2.. \
  --endpoint '^/spacex/.+' \
  --out-dir  /tmp/spacex-snapshot
```

This pulls the last 15 minutes of successful (`2xx`) inbound traffic to `java-server` matching `/spacex/.+`, and writes one `.json` file per RRPair under `/tmp/spacex-snapshot/snapshot-<uuid>/<host>/`.

### Filter flags (translated to ES Query DSL)

| Flag | ES field queried | Match type |
|---|---|---|
| `--cluster X` | `Resource.cluster.keyword` | term (exact) |
| `--service X` | `Attributes.service.keyword` | term (exact) |
| `--namespace X` | `Attributes.namespace.keyword` | term (exact) |
| `--method GET` | `Body.command.keyword` | regexp |
| `--status 2..` | `Body.status.keyword` | regexp |
| `--endpoint '^/api/.+'` | `Body.location.keyword` | regexp |
| `--direction IN\|OUT` | `Body.direction.keyword` | term (exact) |

For full Query DSL control, pass `--query '{"bool":{"must":[...]}}' ` and the other filter flags are ignored.

### Output

```
<out-dir>/
├── .metadata/
│   └── snapshot.json              # synthesized: id, source=elasticsearch, time window, query
└── snapshot-<uuid>/
    ├── java-server/
    │   ├── <rrpair-uuid>.json     # one file per RRPair (proto JSON form)
    │   └── ...
    └── <other-host>/
        └── ...
```

Identical shape to `loki-gather.py` and to `speedctl proxymock cloud pull snapshot` — so anything downstream that reads either source works without modification.

### Replay with proxymock

After gathering, point proxymock at the directory:

```bash
proxymock mock --in /tmp/spacex-snapshot
```

Then route your app's outbound traffic through `localhost:4140` (the default proxymock proxy port) to get recorded responses.

**Workflow note:** `proxymock mock` answers your app's *outbound* calls — so the relevant records are `direction=OUT` ones. If you want to *replay* inbound traffic against a service (e.g. exercise `java-server` with its recorded request stream), filter to `--direction IN` and use `proxymock replay` instead.

### Known gotchas

- **`Body.cluster` workaround.** The forwarder ships `Body.cluster: "undefined"` for every record today (S-11091). The script overwrites it with the OTel resource attribute `Resource.cluster` so downstream tools see the right cluster name. Same for `Body.namespace` (overwritten from `Attributes.namespace`).
- **Signature `instance` numbers.** The cloud snapshot analyzer normally adds an `instance: N` field to each recorded signature so proxymock can deterministically dedupe replays of the same call. We skip the analyzer (by design), so the script assigns instance numbers itself by sorting records by ES ingest order.
- **`index.max_result_window` cap (10000 by default).** The script's `--limit` defaults to 5000 and ES caps `from + size` at 10000. For larger windows, narrow the query or use multiple invocations. Search After API support is a phase-2 improvement.
- **Port conflicts.** If your gathered set includes a Postgres or MySQL recording, `proxymock mock` will try to bind ports 5432 / 3306. Conflicts with anything local listening there. Filter to HTTP only (`--query '{"term":{"Body.l7protocol.keyword":"http"}}'`) if needed.

### Want markdown files instead of JSON?

This script writes `.json` only — proxymock owns format conversion. Replay the snapshot through `proxymock` and ask it to write markdown:

```bash
# Gather as .json (this script)
python3 es-gather.py --out-dir /tmp/snap …

# Re-emit as .md via proxymock
proxymock mock --in /tmp/snap --out /tmp/snap-md --out-format markdown
```

The canonical markdown encoder lives in `lib/rrfile/markdown/codec.go`; keeping two encoders in sync as the format evolves is a maintenance trap we deliberately avoid.

### What's deliberately not here (yet)

- Search After pagination for large result sets. Today, `--limit` is capped at ES's `index.max_result_window` (10000 default); either narrow the window or use multiple invocations.
- Auth (`--bearer-token`, `--api-key`). The BYOC reference ES has `xpack.security.enabled=false`. Add when needed.

See S-11131 for the design history and S-11101 for the "phase 2 → speedctl integration" path.
