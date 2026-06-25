#!/usr/bin/env bash
# Proves: the Micronaut OTLP/gRPC repro renders, builds, starts, and emits spans.
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
REPRO_DIR="$ROOT/java/otel-grpc-repro"
IMAGE="localhost/micronaut-otel-grpc-repro:latest"
PORT="${PORT:-18081}"
CID=""

cleanup() {
  if [[ -n "$CID" ]]; then
    docker rm -f "$CID" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

echo "Checking Kubernetes overlay..."
kubectl kustomize "$REPRO_DIR/k8s" >/tmp/otel-grpc-repro-rendered.yaml

echo "Building repro image..."
docker build -t "$IMAGE" "$REPRO_DIR/app" >/tmp/otel-grpc-repro-docker-build.log

echo "Starting repro container..."
CID="$(docker run -d -p "$PORT:8080" -e OTEL_EXPORTER_OTLP_ENDPOINT=http://host.docker.internal:4317 "$IMAGE")"

echo "Waiting for health endpoint..."
for _ in $(seq 1 30); do
  if curl -sf "http://localhost:$PORT/health" >/tmp/otel-grpc-repro-health.json; then
    break
  fi
  sleep 1
done

if ! curl -sf "http://localhost:$PORT/health" >/tmp/otel-grpc-repro-health.json; then
  echo "FAIL: /health did not respond"
  docker logs "$CID" || true
  exit 1
fi

if ! grep -q '"status":"ok"' /tmp/otel-grpc-repro-health.json; then
  echo "FAIL: /health response did not come from the repro app"
  cat /tmp/otel-grpc-repro-health.json
  exit 1
fi

sleep 3
docker logs "$CID" >/tmp/otel-grpc-repro-container.log 2>&1

if ! grep -q "emitted span" /tmp/otel-grpc-repro-container.log; then
  echo "FAIL: container started but did not emit spans"
  cat /tmp/otel-grpc-repro-container.log
  exit 1
fi

echo "PASS: overlay renders, image builds, app starts, /health responds, and spans are emitted"
cat /tmp/otel-grpc-repro-health.json
echo
