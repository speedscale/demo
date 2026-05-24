# Speedscale BYOC Reference Architectures

Each scenario lives under `reference-architectures/` and is a self-contained Minikube setup. Each runs in its own namespace so multiple scenarios can coexist on one cluster.

| Scenario | Namespace | Stack | Best for |
|---|---|---|---|
| [`byoc`](byoc/) | `byoc-smoke` | Fluent Bit → stdout | Quickest start; verify BYOC is wired |
| [`grafana`](grafana/) | `byoc-grafana` | OTel → Loki → Grafana | Log exploration + dashboards |
| [`elasticsearch`](elasticsearch/) | `byoc-elasticsearch` | OTel → Elasticsearch → Kibana | Full-text search + Discover |
| [`fluent-bit`](fluent-bit/) | `byoc-fluent-bit` | OTel → Fluent Bit → Elasticsearch → Kibana | Fluent Bit as gateway |

Each directory contains:

- `values/values.yaml` — Speedscale Operator Helm values (`byoc_otel.otel_endpoint` points at this scenario's collector)
- `manifests/namespaces.yaml` — creates the scenario's namespace
- scenario-specific manifests (collector, backend, viz)
- `byoc/` also includes `scripts/` (start + verify) and `otel/` (optional collector config)
- `grafana/` also includes `scripts/loki-gather.py` for `proxymock`-replayable exports

## Switching which scenario receives traffic

The Speedscale Forwarder ships RRPairs to one OTLP endpoint at a time. To switch which scenario receives them:

```bash
helm upgrade speedscale-operator speedscale/speedscale-operator \
  -n speedscale \
  -f reference-architectures/<scenario>/values/values.yaml
```

The forwarder restarts and traffic starts flowing into the new scenario's collector. Previously-captured data in the *other* scenarios is untouched.

## Tearing down a scenario

Each scenario is isolated in its own namespace:

```bash
kubectl delete ns byoc-grafana   # (or any other byoc-* namespace)
```

This atomically removes deployments, services, ConfigMaps, secrets, and PVCs for that scenario. The other scenarios are unaffected.
