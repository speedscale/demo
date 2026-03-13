#!/usr/bin/env bash
# configure-keys.sh
#
# Creates (or updates) the llm-api-keys Kubernetes Secret from environment
# variables.  Any variable that is unset or empty is skipped; the backend
# treats missing keys as "provider not configured" and excludes that provider
# from /api/providers.
#
# Usage:
#   export OPENAI_API_KEY=sk-...
#   export ANTHROPIC_API_KEY=sk-ant-...
#   export GEMINI_API_KEY=AIza...
#   ./configure-keys.sh
#
# Or inline:
#   OPENAI_API_KEY=sk-... ANTHROPIC_API_KEY=sk-ant-... ./configure-keys.sh
#
# To target a different context / namespace:
#   KUBE_CONTEXT=my-cluster NAMESPACE=my-ns ./configure-keys.sh

set -euo pipefail

NAMESPACE="${NAMESPACE:-llm-simulation}"
KUBE_CONTEXT="${KUBE_CONTEXT:-}"
SECRET_NAME="llm-api-keys"

KUBECTL="kubectl"
if [[ -n "$KUBE_CONTEXT" ]]; then
  KUBECTL="kubectl --context=$KUBE_CONTEXT"
fi

# Collect only the non-empty keys so kubectl doesn't create empty literals
LITERALS=()

add_key() {
  local var_name="$1"
  local value="${!var_name:-}"
  if [[ -n "$value" ]]; then
    LITERALS+=("--from-literal=${var_name}=${value}")
    echo "  [+] $var_name"
  else
    echo "  [ ] $var_name  (skipped — not set)"
  fi
}

echo ""
echo "=== LLM Simulation Demo — API Key Configuration ==="
echo ""
echo "Namespace : $NAMESPACE"
echo "Secret    : $SECRET_NAME"
echo ""
echo "Keys:"

add_key OPENAI_API_KEY
add_key ANTHROPIC_API_KEY
add_key GEMINI_API_KEY
add_key COHERE_API_KEY
add_key MISTRAL_API_KEY

if [[ ${#LITERALS[@]} -eq 0 ]]; then
  echo ""
  echo "ERROR: No API keys are set. Export at least one provider key and re-run."
  echo ""
  echo "  export OPENAI_API_KEY=sk-..."
  echo "  export ANTHROPIC_API_KEY=sk-ant-..."
  echo "  export GEMINI_API_KEY=AIza..."
  echo ""
  exit 1
fi

# Ensure the namespace exists before writing the secret
$KUBECTL get namespace "$NAMESPACE" &>/dev/null || \
  $KUBECTL apply -f "$(dirname "$0")/namespace.yaml"

# Delete + recreate is the safest way to avoid merge issues with stringData vs data
if $KUBECTL get secret "$SECRET_NAME" -n "$NAMESPACE" &>/dev/null; then
  echo ""
  echo "Secret '$SECRET_NAME' already exists — replacing..."
  $KUBECTL delete secret "$SECRET_NAME" -n "$NAMESPACE"
fi

$KUBECTL create secret generic "$SECRET_NAME" \
  -n "$NAMESPACE" \
  "${LITERALS[@]}"

echo ""
echo "Secret '$SECRET_NAME' created successfully in namespace '$NAMESPACE'."
echo ""
echo "Next steps:"
echo "  kubectl apply -k $(dirname "$0")"
echo "  kubectl rollout status deployment/llm-simulation-backend -n $NAMESPACE"
echo ""
