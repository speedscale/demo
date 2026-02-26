#!/usr/bin/env bash
# Build all images inside minikube's Docker and deploy the Java + .NET + Node stack.
# Run from the repository root.

set -e
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
cd "$REPO_ROOT"

VERSION=$(cat VERSION)
echo "Using minikube Docker daemon (VERSION=$VERSION)..."
eval "$(minikube docker-env)"

echo "Building gateway (gcr.io/speedscale-demos/scenarios-gateway:v$VERSION)..."
docker build -t "gcr.io/speedscale-demos/scenarios-gateway:v$VERSION" -f scenarios/microservices/gateway/Dockerfile scenarios/microservices/gateway

echo "Building java-server..."
docker build -t java-server:local -f java/Dockerfile java

echo "Building csharp-weather..."
docker build -t csharp-weather:local -f csharp/Dockerfile csharp

echo "Building node-server..."
docker build -t node-server:local -f node/Dockerfile node

echo "Deploying to namespace demo-stack..."
kubectl apply -k scenarios/microservices/k8s

echo "Waiting for deployments to be ready..."
kubectl rollout status deployment/java-server -n demo-stack --timeout=120s
kubectl rollout status deployment/csharp-weather -n demo-stack --timeout=120s
kubectl rollout status deployment/node-server -n demo-stack --timeout=120s
kubectl rollout status deployment/gateway -n demo-stack --timeout=60s

echo ""
echo "Stack is up. To test the gateway:"
echo "  kubectl port-forward -n demo-stack svc/gateway 8080:80"
echo "  curl http://localhost:8080/health"
echo "  curl http://localhost:8080/java/healthz"
echo "  curl http://localhost:8080/csharp/health"
echo "  curl http://localhost:8080/node/healthz"
