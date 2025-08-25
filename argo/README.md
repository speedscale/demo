# Simple Multi-Cluster GitOps with ArgoCD

Deploy your apps to multiple Kubernetes clusters using ArgoCD - the simple way.

## What You'll Get

- Each cluster runs its own ArgoCD
- Each app repo contains its own Kubernetes configs
- No complicated central GitOps repo
- Deploy to: Colima, GKE, EKS, DigitalOcean, Minikube

## Quick Start

### 1. Install ArgoCD on all clusters
```bash
./scripts/install-argocd.sh
```

### 2. Add k8s configs to your app repos
```bash
# In each of your demo app repositories:
./scripts/setup-app-repo.sh
```

### 3. Deploy apps to all clusters
```bash
./scripts/deploy-apps.sh
```

That's it! Your apps are now deployed via GitOps.

## How It Works

1. **Each cluster** has its own ArgoCD instance
2. **Each app** has a `k8s/` folder with manifests for each cluster
3. **ArgoCD** watches your app repos and deploys when you push changes

## File Structure

```
your-app-repo/
├── src/                 # Your application code
├── k8s/
│   ├── base/           # Base Kubernetes manifests
│   └── overlays/       # Cluster-specific configs
│       ├── colima/
│       ├── gke/
│       ├── eks/
│       ├── do/
│       └── minikube/
└── Dockerfile
```

## Next Steps

1. Run the quick start commands above
2. Customize cluster configs in `k8s/overlays/`
3. Push changes to see them deployed automatically

## Scripts Reference

- `scripts/install-argocd.sh` - Install ArgoCD on all clusters
- `scripts/setup-app-repo.sh` - Add k8s configs to an app repo
- `scripts/deploy-apps.sh` - Deploy all apps to all clusters
- `scripts/get-argocd-passwords.sh` - Get ArgoCD admin passwords

## Troubleshooting

**ArgoCD not syncing?**
```bash
kubectl config use-context <cluster>
kubectl port-forward svc/argocd-server -n argocd 8080:443
# Visit https://localhost:8080
```

**App not deploying to a cluster?**
- Check if `k8s/overlays/<cluster>/` exists in your app repo
- Verify the cluster context name matches

## Advanced

Want to customize further? Check out the detailed docs:
- `docs/architecture.md` - Architecture decisions
- `docs/customization.md` - Advanced configuration options