#!/usr/bin/env bash
# deploy-local.sh
#
# Deploys the LLM Simulation Demo to a local Kubernetes cluster.
#
# By default uses the public GCR images (imagePullPolicy: IfNotPresent).
# Pass BUILD=1 to rebuild images from local source before deploying —
# required when testing uncommitted changes or after the first local checkout.
#
# Usage:
#   ./deploy-local.sh                    # redeploy all (public images)
#   ./deploy-local.sh frontend           # redeploy frontend only
#   ./deploy-local.sh backend            # redeploy backend only
#   ./deploy-local.sh tools              # redeploy tools-service only
#   ./deploy-local.sh nginx              # redeploy nginx only
#   ./deploy-local.sh tunnel             # start minikube tunnel (M-series Mac)
#
#   BUILD=1 ./deploy-local.sh all        # rebuild all images then redeploy
#   BUILD=1 ./deploy-local.sh frontend   # rebuild frontend image then redeploy
#
# Environment overrides:
#   KUBE_CONTEXT=my-cluster   target cluster context (default: current)
#   NAMESPACE=llm-simulation  target namespace
#   BUILD=1                   rebuild images locally before deploying

set -euo pipefail

KUBE_CONTEXT="${KUBE_CONTEXT:-}"
NAMESPACE="${NAMESPACE:-llm-simulation}"
TARGET="${1:-all}"
BUILD="${BUILD:-0}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VERSION="$(cat "${SCRIPT_DIR}/../VERSION" 2>/dev/null || echo "1.0.0")"

KUBECTL="kubectl"
if [[ -n "${KUBE_CONTEXT}" ]]; then
  KUBECTL="kubectl --context=${KUBE_CONTEXT}"
fi

CURRENT_CTX="$(${KUBECTL} config current-context 2>/dev/null || echo 'unknown')"

# ── tunnel subcommand (minikube / M-series Mac) ──────────────────────────────
if [[ "${TARGET}" == "tunnel" ]]; then
  echo ""
  echo "=== Starting minikube tunnel ==="
  echo "  This routes LoadBalancer IPs to localhost."
  echo "  App will be available at http://localhost:3000 once the tunnel is up."
  echo "  (Ctrl-C to stop — may require sudo)"
  echo ""
  exec minikube tunnel
fi

# ── local image build ────────────────────────────────────────────────────────
# Builds an image directly into the cluster's local daemon so the pod picks
# up local source changes without pushing to a registry.
# Service-to-source-dir mapping: tools→tools-service, others match by name.
build_image() {
  local name="$1"
  local src_dir="${name}"
  [[ "${name}" == "tools" ]] && src_dir="tools-service"
  local tag="gcr.io/speedscale-demos/llm-simulation-${name}:v${VERSION}"
  echo ""
  echo "── Building ${tag} from ${SCRIPT_DIR}/${src_dir} ──"
  if minikube status &>/dev/null 2>&1; then
    eval "$(minikube docker-env)"
    docker build -t "${tag}" "${SCRIPT_DIR}/${src_dir}"
  elif command -v nerdctl &>/dev/null; then
    nerdctl --namespace k8s.io build -t "${tag}" "${SCRIPT_DIR}/${src_dir}"
  else
    docker build -t "${tag}" "${SCRIPT_DIR}/${src_dir}"
  fi
  echo "  ✓ built ${tag}"
}

# ── deploy ──────────────────────────────────────────────────────────────────
echo ""
echo "=== LLM Simulation Demo — Deploy ==="
echo ""
echo "  Context   : ${CURRENT_CTX}"
echo "  Namespace : ${NAMESPACE}"
echo "  Target    : ${TARGET}"
echo "  Version   : v${VERSION}"
if [[ "${BUILD}" == "1" ]]; then
  echo "  Images    : building locally from source"
else
  echo "  Images    : gcr.io/speedscale-demos/llm-simulation-* (public, IfNotPresent)"
  echo "              tip: pass BUILD=1 to rebuild from local source"
fi
echo ""

echo "── Applying k8s manifests ──"
KUBESAFE_BYPASS=1 ${KUBECTL} apply -k "${SCRIPT_DIR}/k8s"

rollout() {
  local name="$1"
  if [[ "${BUILD}" == "1" ]] && [[ "${name}" != "nginx" ]]; then
    build_image "${name}"
  fi
  echo ""
  echo "── Rolling out ${name} ──"
  ${KUBECTL} rollout restart "deployment/llm-simulation-${name}" -n "${NAMESPACE}"
  ${KUBECTL} rollout status  "deployment/llm-simulation-${name}" -n "${NAMESPACE}" --timeout=120s
  echo "  ✓ ${name} ready"
}

case "${TARGET}" in
  tools)    rollout tools ;;
  backend)  rollout backend ;;
  frontend) rollout frontend ;;
  nginx)    rollout nginx ;;
  all)      rollout tools; rollout backend; rollout frontend; rollout nginx ;;
  *)
    echo "ERROR: unknown target '${TARGET}'. Use: all | tools | backend | frontend | nginx | tunnel"
    exit 1
    ;;
esac

echo ""
echo "=== Deploy complete ==="
echo ""
echo "  Traffic flow: browser → nginx → frontend → backend → tools-service → LLM API"
echo ""
echo "  Rancher Desktop : http://localhost:3000"
echo "  Minikube        : ./deploy-local.sh tunnel  then  http://localhost:3000"
echo ""
echo "  Speedscale capture (port-forward to nginx):"
echo "    kubectl port-forward -n llm-simulation svc/llm-simulation-nginx 3000:80"
echo ""
