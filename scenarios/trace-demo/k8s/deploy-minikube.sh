#!/usr/bin/env bash
# Build the trace-demo image inside minikube's Docker and deploy the whole
# stack (gateway + 5 backends + loadgen) to the trace-demo namespace.
# Run from anywhere; paths resolve relative to this script.
set -euo pipefail

SCENARIO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Pointing Docker at minikube..."
eval "$(minikube docker-env)"

echo "Building trace-demo:local..."
docker build -t trace-demo:local "$SCENARIO_DIR"

echo "Deploying to namespace trace-demo..."
kubectl apply -k "$SCENARIO_DIR/k8s"

echo "Waiting for rollouts..."
for d in cart pricing tax payment shipping gateway loadgen; do
  kubectl rollout status "deployment/$d" -n trace-demo --timeout=120s
done

cat <<'EOF'

Stack is up in namespace "trace-demo". The loadgen is already driving traces.

Smoke-test the gateway directly:
  kubectl port-forward -n trace-demo svc/gateway 8080:80
  curl -s -X POST localhost:8080/checkout \
    -H 'X-Trace-Id: deadbeefdeadbeefdeadbeefdeadbeef' | jq .

Record it with Speedscale/proxymock, then in proxymock-web → Requests:
  - add a Request Header filter on X-Trace-Id (any one captured value)
  - click the Trace toggle to see that request's full waterfall.
EOF
