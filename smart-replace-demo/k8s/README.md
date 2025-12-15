# Kubernetes Deployment

## Prerequisites

- kubectl installed and configured
- Access to Kubernetes cluster
- Docker images pushed to gcr.io/speedscale-demos/

## Quick Start

### Deploy to smart-replace-demo namespace

```bash
# Create namespace
kubectl create namespace smart-replace-demo

# Deploy using kustomize
kubectl apply -k k8s/overlays/smart-replace-demo
```

## Verify Deployment

```bash
# Check pods
kubectl get pods -n smart-replace-demo

# Check services
kubectl get svc -n smart-replace-demo

# Test cart service
kubectl port-forward -n smart-replace-demo svc/cart-service 8080:8080
curl http://localhost:8080/health

# View logs
kubectl logs -n smart-replace-demo deployment/cart-service
kubectl logs -n smart-replace-demo deployment/warehouse-service
```

## Update Deployment

```bash
# Update environment
kubectl apply -k k8s/overlays/smart-replace-demo

# Restart deployments
kubectl rollout restart -n smart-replace-demo deployment/cart-service
kubectl rollout restart -n smart-replace-demo deployment/warehouse-service
```

## Cleanup

```bash
kubectl delete -k k8s/overlays/smart-replace-demo
kubectl delete namespace smart-replace-demo
```

## Architecture

```
┌─────────────┐
│ cart-service│ :8080
│ (2 replicas)│
└──────┬──────┘
       │
       │ HTTP calls
       ▼
┌───────────────────┐
│ warehouse-service │ :8081
│   (1 replica)     │
└───────────────────┘
```

## Images

- Cart Service: `gcr.io/speedscale-demos/smart-replace-cart:latest`
- Warehouse Service: `gcr.io/speedscale-demos/smart-replace-warehouse:latest`
