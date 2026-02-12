#!/bin/bash
set -e

# Get cluster name from argument
CLUSTER_NAME=${1:-}

if [ -z "$CLUSTER_NAME" ]; then
  echo "Error: Please provide a cluster name"
  echo "Usage: $0 <cluster-name>"
  echo ""
  echo "Available contexts:"
  kubectl config get-contexts -o name
  exit 1
fi

# Check if context exists
if ! kubectl config get-contexts -o name | grep -q "^$CLUSTER_NAME$"; then
  echo "Error: Context '$CLUSTER_NAME' not found in kubeconfig"
  echo ""
  echo "Available contexts:"
  kubectl config get-contexts -o name
  exit 1
fi

kubectl config use-context "$CLUSTER_NAME"

echo "Removing ArgoCD from cluster: $CLUSTER_NAME"

# Delete namespace (removes all ArgoCD workloads, services, configmaps, etc.)
if kubectl get namespace argocd &>/dev/null; then
  kubectl delete namespace argocd --timeout=120s
  echo "Deleted namespace argocd"
else
  echo "Namespace argocd not found (already removed or never installed)"
fi

# Cluster-scoped CRDs are not removed when the namespace is deleted.
# Remove them so a re-install starts clean.
for crd in applications.argoproj.io appprojects.argoproj.io applicationsets.argoproj.io; do
  if kubectl get crd "$crd" &>/dev/null; then
    kubectl delete crd "$crd" --timeout=60s
    echo "Deleted CRD $crd"
  fi
done

echo ""
echo "ArgoCD has been uninstalled from $CLUSTER_NAME"
