# Getting Started - Step by Step

Follow these simple steps to deploy your apps to multiple clusters using GitOps.

## Prerequisites

- kubectl configured with contexts for your clusters
- Git repositories for your demo applications

## Step 1: Install ArgoCD

Install ArgoCD on all your clusters:

```bash
./scripts/install-argocd.sh
```

This will install ArgoCD on: colima, gke, eks, do, minikube (skips any that don't exist).

## Step 2: Get ArgoCD Passwords

Get the admin passwords for each cluster:

```bash
./scripts/get-argocd-passwords.sh
```

Save these passwords - you'll need them to access the ArgoCD UI.

## Step 3: Setup Your App Repositories

For each of your demo applications, add Kubernetes configs:

```bash
# Go to your app repository
cd /path/to/your-demo-app

# Run the setup script
/path/to/this-repo/scripts/setup-app-repo.sh

# Edit the generated files:
# - Update k8s/base/deployment.yaml with your actual Docker image
# - Customize k8s/overlays/ for each cluster if needed

# Commit and push
git add k8s/
git commit -m "Add Kubernetes manifests for GitOps"
git push
```

## Step 4: Configure Apps to Deploy

Edit `scripts/deploy-apps.sh` and update the APPS array with your repositories:

```bash
APPS=(
  "https://github.com/your-org/demo-app-1"
  "https://github.com/your-org/demo-app-2"
  "https://github.com/your-org/your-awesome-app"
)
```

## Step 5: Deploy Everything

Deploy all apps to all clusters:

```bash
./scripts/deploy-apps.sh
```

This creates ArgoCD Applications that will automatically deploy your apps.

## Step 6: Verify Deployment

Check that everything is working:

```bash
# Pick a cluster
kubectl config use-context colima

# Check ArgoCD applications
kubectl get applications -n argocd

# Check your deployed apps
kubectl get pods -A | grep your-app-name
```

## Step 7: Access ArgoCD UI (Optional)

To see the pretty UI:

```bash
kubectl config use-context colima
kubectl port-forward svc/argocd-server -n argocd 8080:443
```

Visit https://localhost:8080 and login with admin + the password from Step 2.

## That's It!

Your apps are now deployed via GitOps. When you push changes to your app repositories, ArgoCD will automatically deploy them.

## What Happens Next?

1. **Make changes** to your app code
2. **Build and push** new Docker images
3. **Update** the image tag in `k8s/base/deployment.yaml`
4. **Push to git** - ArgoCD automatically deploys the changes

## Troubleshooting

**App not showing up?**
- Check if the k8s/overlays/CLUSTER folder exists in your app repo
- Verify your cluster context name matches what's in the scripts

**Deployment failing?**
- Check the ArgoCD UI for detailed error messages
- Verify your Docker image exists and is accessible

**Need help?**
- Look at the example files in `examples/`
- Check kubectl logs for ArgoCD pods: `kubectl logs -n argocd -l app.kubernetes.io/name=argocd-application-controller`