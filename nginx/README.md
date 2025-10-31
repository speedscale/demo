## NGINX Demo

This is a simple demo application for Kubernetes showcasing a microservices architecture built entirely with NGINX. The application simulates an online ordering system with a gateway that routes traffic to internal microservices (payment and user) and external APIs (SpaceX, GitHub).

## Directory Structure

```
nginx/
├── base/           # Base Kubernetes resources (deployments, services, configmaps)
├── patch/          # Kustomize patches (e.g., Speedscale sidecar injection)
├── jobs/           # Traffic generation CronJob and scripts
├── replays/        # TrafficReplay custom resources
├── kustomization.yaml
└── ns.yaml         # Namespace definition
```

## Architecture

- **Gateway**: NGINX reverse proxy that routes requests to:
  - `/payment` → Payment service
  - `/user` → User service
  - `/login` → Returns authentication response
  - `/spacex` → SpaceX API (external backend)
- **Payment**: NGINX service that proxies to GitHub API (demonstrates external API integration)
- **User**: NGINX service that returns user profile information
- **Traffic Generator**: CronJob that runs every 5 minutes, simulating 10 users with realistic behavior patterns

## Prerequisites

- Kubernetes cluster (minikube, kind, or cloud provider)
- kubectl configured to access your cluster
- Speedscale operator installed (for traffic capture and replay)

## Deployment

Deploy all three services (gateway, payment, user) to the `demo` namespace:

```bash
kubectl apply -k ./
```

This will create:
- Namespace: `demo`
- Deployments: gateway, payment, user
- Services: gateway, payment, user
- ConfigMaps with NGINX configurations and traffic generation script
- **CronJob** that generates traffic every 5 minutes automatically

Verify the deployment:

```bash
kubectl get pods -n demo
kubectl get services -n demo
kubectl get cronjobs -n demo
```

## Continuous Traffic Generation

The demo includes a **CronJob** that automatically generates exciting simulated user traffic **every 5 minutes**. This creates:

- **10 named users** (Alice, Bob, Charlie, Diana, Eve, Frank, Grace, Henry, Ivy, Jack)
- **User personas**: Space enthusiasts, shoppers, browsers, and power users
- **Realistic behavior**: Login flows, profile views, varied actions based on user type
- **Randomized timing**: Variable delays between requests to simulate real users
- **Live stats**: Color-coded output showing success/failure rates
- **Background activity**: Simulated API health checks and background jobs

The script hits all gateway endpoints with realistic patterns:
- Authentication flows via `/login`
- User profile management via `/user` and `/user/profile/{id}`
- Payment processing via `/payment` and `/payment/lookup/{id}`
- External SpaceX API calls via `/spacex/*` (launches, rockets, company info)

### Monitor the Traffic

Watch the continuous traffic generation:

```bash
# Check CronJob schedule
kubectl get cronjobs -n demo

# See recent jobs
kubectl get jobs -n demo

# Watch logs from the most recent run
kubectl logs -f $(kubectl get pods -n demo -l job-name --sort-by=.metadata.creationTimestamp -o name | tail -1)
```

### Trigger Immediate Run

To generate traffic immediately without waiting for the schedule:

```bash
kubectl create job traffic-manual --from=cronjob/traffic-generator -n demo

# Watch it run
kubectl logs -f job/traffic-manual -n demo
```

### Adjust the Schedule

To change how often traffic is generated, edit the CronJob:

```bash
# Every 2 minutes: "*/2 * * * *"
# Every 10 minutes: "*/10 * * * *"
# Every hour: "0 * * * *"

kubectl edit cronjob traffic-generator -n demo
```

### Pause Traffic Generation

To temporarily stop automatic traffic generation:

```bash
kubectl patch cronjob traffic-generator -n demo -p '{"spec":{"suspend":true}}'
```

To resume:

```bash
kubectl patch cronjob traffic-generator -n demo -p '{"spec":{"suspend":false}}'
```

### Custom Traffic

To generate custom traffic, you can also use the curl script:

```bash
./run_curl.sh
```

## Capturing Traffic with Speedscale

Enable sidecar injection by uncommenting the patch in `kustomization.yaml`:

```yaml
patchesStrategicMerge:
- patch/inject.yaml
```

Then redeploy:

```bash
kubectl apply -k ./
```

Generate traffic and Speedscale will automatically capture all inbound and outbound requests.

### TLS Certificate Handling

The gateway and payment services automatically detect when Speedscale is injected:

- **With Speedscale**: Uses the injected CA certificate at `/etc/ssl/speedscale/ca-certificates.crt` for TLS verification. This allows replay to work correctly with mocked external APIs.
- **Without Speedscale**: Uses system default TLS verification for direct connections to external APIs.

The containers check for the `SSL_CERT_FILE` environment variable at startup and configure nginx accordingly. This means replay traffic works seamlessly without 502 errors on external API calls.

## Replaying Traffic

Once you have captured traffic, you can replay it against your services.

### Update the Snapshot ID

Edit `replays/replay.yaml` and update the `snapshotID` field with your captured snapshot ID:

```yaml
spec:
  snapshotID: "your-snapshot-id-here"
```

### Apply the TrafficReplay Resource

```bash
kubectl apply -f replays/replay.yaml
```

This will:
1. Create a temporary workload with the gateway deployment
2. Replay the captured traffic against it
3. Validate responses match expected behavior
4. Clean up temporary resources when complete

### Monitor the Replay

Check the status of the replay:

```bash
kubectl get trafficreplay -n demo
kubectl describe trafficreplay nginx-demo-replay -n demo
```

View replay results in the Speedscale dashboard or via CLI:

```bash
speedctl replay get nginx-demo-replay
```

## Testing the SpaceX API Integration

The gateway now includes a proxy to the SpaceX API. You can test it by:

```bash
# Get latest launch info
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -n demo -- \
  curl http://gateway/spacex/launches/latest

# Get all rockets
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -n demo -- \
  curl http://gateway/spacex/rockets

# Get company info
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -n demo -- \
  curl http://gateway/spacex/company
```

These requests proxy through the gateway to `https://api.spacexdata.com/v4/*`.

## Cleanup

Remove all resources (this will also stop the CronJob):

```bash
kubectl delete -k ./
kubectl delete -f replays/replay.yaml
```

Or delete the entire namespace (quickest way):

```bash
kubectl delete namespace demo
```

To stop just the traffic generation without removing the services:

```bash
kubectl delete cronjob traffic-generator -n demo
```
