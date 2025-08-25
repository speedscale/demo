#!/bin/bash
set -e

# Get ArgoCD admin passwords for all clusters
CLUSTERS=("colima" "gke" "eks" "do" "minikube")

echo "Getting ArgoCD admin passwords..."

for cluster in "${CLUSTERS[@]}"; do
  echo ""
  echo "=== $cluster ==="
  
  # Check if context exists
  if ! kubectl config get-contexts | grep -q "$cluster"; then
    echo "⚠️  Context '$cluster' not found, skipping..."
    continue
  fi
  
  # Switch context
  kubectl config use-context "$cluster"
  
  # Get password
  if kubectl get secret argocd-initial-admin-secret -n argocd >/dev/null 2>&1; then
    password=$(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d)
    echo "Username: admin"
    echo "Password: $password"
    echo "Access: kubectl port-forward svc/argocd-server -n argocd 8080:443"
  else
    echo "❌ ArgoCD not installed or password already rotated"
  fi
done