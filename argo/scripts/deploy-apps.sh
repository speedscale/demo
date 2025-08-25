#!/bin/bash
set -e

# Deploy apps to all clusters using ArgoCD

# Configuration - Edit these arrays
CLUSTERS=("colima" "gke" "eks" "do" "minikube")
APPS=(
  "https://github.com/your-org/demo-app-1"
  "https://github.com/your-org/demo-app-2"
  # Add your app repositories here
)

echo "Deploying apps to all clusters..."

for cluster in "${CLUSTERS[@]}"; do
  echo ""
  echo "=== Deploying to $cluster ==="
  
  # Check if context exists
  if ! kubectl config get-contexts | grep -q "$cluster"; then
    echo "⚠️  Context '$cluster' not found, skipping..."
    continue
  fi
  
  # Switch context
  kubectl config use-context "$cluster"
  
  # Check if ArgoCD is installed
  if ! kubectl get namespace argocd >/dev/null 2>&1; then
    echo "❌ ArgoCD not installed on $cluster, run ./scripts/install-argocd.sh first"
    continue
  fi
  
  for app_repo in "${APPS[@]}"; do
    app_name=$(basename "$app_repo")
    
    echo "Deploying $app_name to $cluster..."
    
    # Create ArgoCD application
    kubectl apply -f - << EOF
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: $app_name
  namespace: argocd
spec:
  project: default
  source:
    repoURL: $app_repo
    targetRevision: HEAD
    path: k8s/overlays/$cluster
  destination:
    server: https://kubernetes.default.svc
    namespace: $app_name-$cluster
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
    - CreateNamespace=true
EOF
    
    echo "✅ Created ArgoCD app: $app_name on $cluster"
  done
done

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "To check status:"
echo "kubectl config use-context <cluster>"
echo "kubectl get applications -n argocd"