#!/usr/bin/env bash
# Install the BYOC reference architecture on Minikube.
# Run from the byoc/ directory: ./scripts/start.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BASE_DIR="$(dirname "$SCRIPT_DIR")"

cd "$BASE_DIR"

echo "==> Starting minikube..."
minikube start

echo "==> Applying namespaces..."
kubectl apply -f manifests/namespaces.yaml

echo "==> Adding Speedscale Helm repo..."
helm repo add speedscale https://speedscale.github.io/operator-helm/ 2>/dev/null || true
helm repo update speedscale

echo "==> Creating API key secret..."
if ! kubectl -n speedscale get secret speedscale-airgapped-apikey &>/dev/null; then
  read -r -p "Enter your Speedscale API key: " SPEEDSCALE_API_KEY
  kubectl -n speedscale create secret generic speedscale-airgapped-apikey \
    --from-literal=SPEEDSCALE_API_KEY="${SPEEDSCALE_API_KEY}" \
    --from-literal=SPEEDSCALE_APP_URL="app.speedscale.com"
else
  echo "   Secret already exists, skipping."
fi

echo "==> Installing Speedscale operator..."
helm upgrade --install speedscale-operator speedscale/speedscale-operator \
  -n speedscale \
  -f values/values.yaml

echo "==> Deploying Fluent Bit..."
kubectl apply -f manifests/fluent-bit.yaml

echo "==> Waiting for Fluent Bit to be ready..."
kubectl -n observability rollout status deploy/fluent-bit --timeout=120s

echo ""
echo "All done. Run ./scripts/verify.sh to check data flow."
