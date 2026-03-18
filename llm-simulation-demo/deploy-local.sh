#!/usr/bin/env bash
# deploy-local.sh
#
# Builds both container images locally with nerdctl and deploys them to a
# local Rancher Desktop cluster.
#
# Usage:
#   ./deploy-local.sh               # build + deploy both services
#   ./deploy-local.sh backend       # build + deploy backend only
#   ./deploy-local.sh frontend      # build + deploy frontend only
#
# Environment overrides:
#   KUBE_CONTEXT=rancher-desktop    # target cluster context
#   NAMESPACE=llm-simulation        # target namespace
#   IMAGE_TAG=v1.3.5                # image tag (must match k8s manifests)

set -euo pipefail

KUBE_CONTEXT="${KUBE_CONTEXT:-}"
NAMESPACE="${NAMESPACE:-llm-simulation}"
IMAGE_TAG="${IMAGE_TAG:-v1.3.5}"
TARGET="${1:-all}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_IMAGE="gcr.io/speedscale-demos/llm-simulation-backend:${IMAGE_TAG}"
FRONTEND_IMAGE="gcr.io/speedscale-demos/llm-simulation-frontend:${IMAGE_TAG}"

KUBECTL="kubectl"
if [[ -n "${KUBE_CONTEXT}" ]]; then
  KUBECTL="kubectl --context=${KUBE_CONTEXT}"
fi

echo ""
echo "=== LLM Simulation Demo — Local Deploy ==="
echo ""
echo "  Context   : ${KUBE_CONTEXT:-$(kubectl config current-context 2>/dev/null || echo 'default')}"
echo "  Namespace : ${NAMESPACE}"
echo "  Tag       : ${IMAGE_TAG}"
echo "  Target    : ${TARGET}"
echo ""

build_backend() {
  echo "── Building backend image ──"
  nerdctl --namespace k8s.io build \
    -t "${BACKEND_IMAGE}" \
    "${SCRIPT_DIR}/backend"
  echo "  ✓ ${BACKEND_IMAGE}"
}

build_frontend() {
  echo "── Building frontend image ──"
  nerdctl --namespace k8s.io build \
    -t "${FRONTEND_IMAGE}" \
    "${SCRIPT_DIR}/frontend"
  echo "  ✓ ${FRONTEND_IMAGE}"
}

deploy() {
  echo ""
  echo "── Applying k8s manifests ──"
  KUBESAFE_BYPASS=1 ${KUBECTL} apply -k "${SCRIPT_DIR}/k8s"

  if [[ "${TARGET}" == "all" || "${TARGET}" == "backend" ]]; then
    echo ""
    echo "── Rolling out backend ──"
    ${KUBECTL} rollout restart deployment/llm-simulation-backend -n "${NAMESPACE}"
    ${KUBECTL} rollout status  deployment/llm-simulation-backend -n "${NAMESPACE}" --timeout=120s
    echo "  ✓ backend ready"
  fi

  if [[ "${TARGET}" == "all" || "${TARGET}" == "frontend" ]]; then
    echo ""
    echo "── Rolling out frontend ──"
    ${KUBECTL} rollout restart deployment/llm-simulation-frontend -n "${NAMESPACE}"
    ${KUBECTL} rollout status  deployment/llm-simulation-frontend -n "${NAMESPACE}" --timeout=120s
    echo "  ✓ frontend ready"
  fi
}

case "${TARGET}" in
  backend)
    build_backend
    deploy
    ;;
  frontend)
    build_frontend
    deploy
    ;;
  all)
    build_backend
    build_frontend
    deploy
    ;;
  *)
    echo "ERROR: unknown target '${TARGET}'. Use: all | backend | frontend"
    exit 1
    ;;
esac

echo ""
echo "=== Deploy complete ==="
echo ""
echo "  App : http://localhost:30300"
echo ""
