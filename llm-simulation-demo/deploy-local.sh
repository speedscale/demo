#!/usr/bin/env bash
# deploy-local.sh
#
# Deploys the LLM Simulation Demo to a local Kubernetes cluster using the
# public GCR images.  No local container build tooling required.
#
# Usage:
#   ./deploy-local.sh               # deploy (or update) both services
#   ./deploy-local.sh backend       # redeploy backend only
#   ./deploy-local.sh frontend      # redeploy frontend only
#
# Environment overrides:
#   KUBE_CONTEXT=my-cluster         # target cluster context (default: current)
#   NAMESPACE=llm-simulation        # target namespace

set -euo pipefail

KUBE_CONTEXT="${KUBE_CONTEXT:-}"
NAMESPACE="${NAMESPACE:-llm-simulation}"
TARGET="${1:-all}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

KUBECTL="kubectl"
if [[ -n "${KUBE_CONTEXT}" ]]; then
  KUBECTL="kubectl --context=${KUBE_CONTEXT}"
fi

CURRENT_CTX="$(${KUBECTL} config current-context 2>/dev/null || echo 'unknown')"

echo ""
echo "=== LLM Simulation Demo — Deploy ==="
echo ""
echo "  Context   : ${CURRENT_CTX}"
echo "  Namespace : ${NAMESPACE}"
echo "  Target    : ${TARGET}"
echo "  Images    : gcr.io/speedscale-demos/llm-simulation-{backend,frontend}"
echo ""

echo "── Applying k8s manifests ──"
KUBESAFE_BYPASS=1 ${KUBECTL} apply -k "${SCRIPT_DIR}/k8s"

rollout() {
  local name="$1"
  echo ""
  echo "── Rolling out ${name} ──"
  ${KUBECTL} rollout restart "deployment/llm-simulation-${name}" -n "${NAMESPACE}"
  ${KUBECTL} rollout status  "deployment/llm-simulation-${name}" -n "${NAMESPACE}" --timeout=120s
  echo "  ✓ ${name} ready"
}

case "${TARGET}" in
  backend)  rollout backend ;;
  frontend) rollout frontend ;;
  all)      rollout backend; rollout frontend ;;
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
