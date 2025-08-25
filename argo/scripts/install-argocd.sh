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

echo "Installing ArgoCD (core + dashboard) on cluster: $CLUSTER_NAME"

# Check if context exists
if ! kubectl config get-contexts -o name | grep -q "^$CLUSTER_NAME$"; then
  echo "Error: Context '$CLUSTER_NAME' not found in kubeconfig"
  echo ""
  echo "Available contexts:"
  kubectl config get-contexts -o name
  exit 1
fi

# Switch context
kubectl config use-context "$CLUSTER_NAME"

# Create namespace
kubectl create namespace argocd --dry-run=client -o yaml | kubectl apply -f -

# Install ArgoCD core
echo "Installing ArgoCD core..."
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/core-install.yaml

# Create the server components manually
echo "Adding ArgoCD server (dashboard)..."
kubectl apply -n argocd -f - <<EOF
apiVersion: v1
kind: ServiceAccount
metadata:
  name: argocd-server
  namespace: argocd
---
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: argocd-server
  namespace: argocd
rules:
- apiGroups:
  - ""
  resources:
  - secrets
  - configmaps
  verbs:
  - create
  - get
  - list
  - watch
  - update
  - patch
  - delete
- apiGroups:
  - argoproj.io
  resources:
  - applications
  - appprojects
  verbs:
  - create
  - get
  - list
  - watch
  - update
  - patch
  - delete
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: argocd-server
  namespace: argocd
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: argocd-server
subjects:
- kind: ServiceAccount
  name: argocd-server
  namespace: argocd
---
apiVersion: v1
kind: Service
metadata:
  name: argocd-server
  namespace: argocd
spec:
  type: ClusterIP
  ports:
  - name: server
    port: 443
    protocol: TCP
    targetPort: 8080
  selector:
    app.kubernetes.io/component: server
    app.kubernetes.io/name: argocd-server
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: argocd-server
  namespace: argocd
spec:
  selector:
    matchLabels:
      app.kubernetes.io/component: server
      app.kubernetes.io/name: argocd-server
  template:
    metadata:
      labels:
        app.kubernetes.io/component: server
        app.kubernetes.io/name: argocd-server
    spec:
      serviceAccountName: argocd-server
      containers:
      - name: argocd-server
        image: quay.io/argoproj/argocd:latest
        command:
        - argocd-server
        ports:
        - containerPort: 8080
        - containerPort: 8083
        livenessProbe:
          httpGet:
            path: /healthz?full=true
            port: 8080
          initialDelaySeconds: 3
          periodSeconds: 30
        readinessProbe:
          httpGet:
            path: /healthz
            port: 8080
          initialDelaySeconds: 3
          periodSeconds: 10
        env:
        - name: ARGOCD_SERVER_INSECURE
          value: "true"
        volumeMounts:
        - mountPath: /app/config/ssh
          name: ssh-known-hosts
      volumes:
      - configMap:
          name: argocd-ssh-known-hosts-cm
        name: ssh-known-hosts
EOF

# Wait for components to be ready
echo "Waiting for ArgoCD to be ready..."
kubectl wait --for=condition=available --timeout=300s deployment/argocd-repo-server -n argocd
kubectl wait --for=condition=available --timeout=300s deployment/argocd-server -n argocd

echo ""
echo "✅ ArgoCD (core + dashboard) installed on $CLUSTER_NAME"
echo ""
echo "Running components (4 pods):"
echo "- Application Controller"
echo "- Repo Server" 
echo "- Redis"
echo "- Web Dashboard"
echo ""
echo "To access ArgoCD:"
echo "1. Port forward: kubectl port-forward svc/argocd-server -n argocd 8080:443"
echo "2. Get password: kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath=\"{.data.password}\" | base64 -d"
echo "3. Login at https://localhost:8080 with username 'admin'"