#!/bin/bash
set -e

# Setup k8s configs in an application repository
APP_NAME=${1:-$(basename $(pwd))}

echo "Setting up k8s configs for app: $APP_NAME"

# Create directory structure
mkdir -p k8s/base
mkdir -p k8s/overlays/{colima,gke,eks,do,minikube}

# Create base kustomization
cat > k8s/base/kustomization.yaml << EOF
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

resources:
  - deployment.yaml
  - service.yaml

commonLabels:
  app: $APP_NAME
EOF

# Create base deployment
cat > k8s/base/deployment.yaml << EOF
apiVersion: apps/v1
kind: Deployment
metadata:
  name: $APP_NAME
spec:
  replicas: 1
  selector:
    matchLabels:
      app: $APP_NAME
  template:
    metadata:
      labels:
        app: $APP_NAME
    spec:
      containers:
      - name: $APP_NAME
        image: $APP_NAME:latest  # Update this to your actual image
        ports:
        - containerPort: 8080
        resources:
          requests:
            memory: "64Mi"
            cpu: "50m"
          limits:
            memory: "128Mi"
            cpu: "100m"
EOF

# Create base service
cat > k8s/base/service.yaml << EOF
apiVersion: v1
kind: Service
metadata:
  name: $APP_NAME
spec:
  selector:
    app: $APP_NAME
  ports:
  - port: 80
    targetPort: 8080
  type: ClusterIP
EOF

# Create overlays for each cluster
CLUSTERS=("colima" "gke" "eks" "do" "minikube")

for cluster in "${CLUSTERS[@]}"; do
  cat > k8s/overlays/$cluster/kustomization.yaml << EOF
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization

bases:
  - ../../base

# Add cluster-specific patches here
# Example:
# patchesStrategicMerge:
#   - deployment-patch.yaml

namePrefix: $cluster-
namespace: $APP_NAME-$cluster
EOF
done

echo ""
echo "✅ Created k8s configs for $APP_NAME"
echo ""
echo "Next steps:"
echo "1. Update k8s/base/deployment.yaml with your actual image"
echo "2. Customize cluster configs in k8s/overlays/"
echo "3. Commit and push to trigger GitOps deployment"