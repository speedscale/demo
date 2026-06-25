# Micronaut OTLP/gRPC Java Agent Repro

This repro isolates a Micronaut OpenTelemetry exporter using the plaintext OTLP/gRPC path:

- `io.opentelemetry:opentelemetry-exporter-otlp:1.54.1`
- `io.micronaut.tracing:micronaut-tracing-opentelemetry-http:7.2.0`
- `OTEL_EXPORTER_OTLP_ENDPOINT=http://tracing-agent.tracing:4317`
- one deployment without the nettap JVM agent
- one deployment with `-javaagent:/nettap-agent/nettap-agent.jar=speedscale-nettap.speedscale:8000`

The app exports a span every second, can generate burst traffic through `/burst?count=N`, and logs each successful emission. The local collector accepts plaintext OTLP/gRPC on `tracing-agent.tracing:4317` and logs received spans through its debug exporter.

## Build

```bash
cd java/otel-grpc-repro
docker build -t localhost/micronaut-otel-grpc-repro:latest app
```

If the cluster cannot see the local Docker daemon, load or push the image for that cluster first.

## Smoke Test

```bash
cd java/otel-grpc-repro
./verify.sh
```

The script renders the Kubernetes overlay, builds the Docker image, runs the app locally, checks `/health`, and confirms span emission in logs.

## Deploy

```bash
kubectl apply -k k8s
kubectl -n tracing rollout status deployment/tracing-agent
kubectl -n otel-grpc-repro rollout status deployment/micronaut-otel-noagent
kubectl -n otel-grpc-repro rollout status deployment/micronaut-otel-agent
```

The agent deployment expects Speedscale nettap to be installed in the cluster with `speedscale-nettap.speedscale:8000` reachable. Change `NETTAP_JAVAAGENT_ENDPOINT` in `k8s/micronaut-otel-agent.yaml` if the service name differs.

## Check

Compare app logs:

```bash
kubectl -n otel-grpc-repro logs deployment/micronaut-otel-noagent --tail=100
kubectl -n otel-grpc-repro logs deployment/micronaut-otel-agent --tail=100
```

Check collector receipt:

```bash
kubectl -n tracing logs deployment/tracing-agent --tail=200 | grep repro.otlp.grpc.export
```

Generate burst traffic through the Java-agent deployment:

```bash
kubectl -n otel-grpc-repro port-forward svc/micronaut-otel-agent 18082:8080
curl -sS 'http://127.0.0.1:18082/burst?count=50000'
```

Generate the same burst against the no-agent baseline:

```bash
kubectl -n otel-grpc-repro port-forward svc/micronaut-otel-noagent 18083:8080
curl -sS 'http://127.0.0.1:18083/burst?count=50000'
```

Expected healthy result:

- both deployments log steady `emitted span` messages
- collector logs spans from both `micronaut-otel-noagent` and `micronaut-otel-agent`
- agent deployment does not log OTLP export failures, connection resets, or gRPC `UNAVAILABLE`

If export failures reproduce, the useful evidence is the agent deployment logs plus collector logs from the same time window.
