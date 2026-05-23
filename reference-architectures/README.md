# Speedscale BYOC Reference Architectures

Each scenario lives under `reference-architectures/` and is a self-contained Minikube setup.

| Scenario | Stack | Best for |
|---|---|---|
| [`byoc`](byoc/) | Fluent Bit → stdout | Quickest start; verify BYOC is working |
| [`grafana`](grafana/) | OTEL → Loki → Grafana | Log exploration + dashboards |
| [`elasticsearch`](elasticsearch/) | OTEL → Elasticsearch → Kibana | Full-text search + Discover |
| [`fluent-bit`](fluent-bit/) | OTEL → Fluent Bit → Elasticsearch → Kibana | Fluent Bit as gateway |

Each directory contains:

- `values/values.yaml` — Speedscale Operator Helm values
- `manifests/namespaces.yaml` — namespace setup
- scenario-specific observability manifests
- `byoc/` also includes `scripts/` (start + verify) and `otel/` (optional collector config)

Run one scenario at a time. Before switching:

```bash
kubectl -n observability delete deploy,svc,cm --all
```
