# Speedscale BYOC: Fluent Bit Gateway

This reference architecture exports Speedscale RRPair logs from OTEL into Fluent Bit, then indexes in Elasticsearch and visualizes in Kibana.

## Architecture

```mermaid
flowchart LR
  subgraph K8s[BYOC Kubernetes Cluster]
    Apps[Payment Apps]
    Cap[eBPF nettap or sidecar capture]
    Fwd[Speedscale Forwarder\nDLP + filter rules]
    OTel[OTEL Collector]
    FB[Fluent Bit]
    ES[Elasticsearch]
    Kibana[Kibana]
  end

  Apps --> Cap --> Fwd --> OTel --> FB --> ES --> Kibana
```

## Install (Minikube)

```bash
minikube start

kubectl apply -f manifests/namespaces.yaml

helm repo add speedscale https://speedscale.github.io/operator-helm/
helm repo update

kubectl -n speedscale create secret generic speedscale-airgapped-apikey \
  --from-literal=SPEEDSCALE_API_KEY="<YOUR_API_KEY>" \
  --from-literal=SPEEDSCALE_APP_URL="app.speedscale.com"

helm upgrade --install speedscale-operator speedscale/speedscale-operator \
  -n speedscale \
  -f values/values.yaml

kubectl apply -f manifests/elasticsearch-kibana.yaml
kubectl apply -f manifests/fluent-bit.yaml
kubectl apply -f manifests/otel-collector.yaml

kubectl -n speedscale get pods
kubectl -n observability get pods
```

## Index + Visualize

- Indexing: Fluent Bit writes to Elasticsearch index prefix `speedscale-rrpair-fluentbit`.
- Visualization: Kibana Discover.

```bash
kubectl -n observability port-forward svc/kibana 5601:5601
```

Open `http://localhost:5601`, create data view `speedscale-rrpair-fluentbit*`, and use Discover.
