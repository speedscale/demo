# Replay sandwich with an external test driver

This scenario starts Speedscale service mocks without the Speedscale traffic generator. After the mocks are ready, the same test can be driven by k6, Postman, or another command that returns a useful exit code.

The example uses the existing Node service. `GET /models` calls the Hugging Face API, so a successful isolated run proves that the application received an inbound test request and its outbound dependency was served by Speedscale.

## Prerequisites

- A Kubernetes cluster with Speedscale v2.5.789 or newer installed
- `speedctl` v2.5.789 or newer, initialized for the target tenant
- `kubectl`
- k6 v2 or the latest Postman CLI
- Network access from the test driver to the Node service

Install the current Postman CLI with `npm install -g postman-cli@latest`. This scenario uses Postman Collection v3 YAML. It does not support Newman or the older v2.1 JSON collection format.

## Deploy and capture

Deploy the Node service with Speedscale capture enabled. The bundled Node traffic generator is disabled because the external driver replaces it.

```bash
kubectl apply -k k8s
kubectl rollout status deployment/node-server -n replay-sandwich
kubectl port-forward -n replay-sandwich service/node-server 3000:80
```

In another terminal, capture one request that reaches the external dependency.

```bash
curl --fail http://127.0.0.1:3000/models

SNAPSHOT_ID=$(speedctl create snapshot \
  --name replay-sandwich \
  --service node-server \
  --start 5m | jq -r .snapshot.id)

speedctl wait snapshot "$SNAPSHOT_ID" --timeout 3m
```

Upload the responder-only test config. Passthrough is disabled, so an unmatched request fails instead of reaching the live dependency.

```bash
speedctl put testconfig speedscale/external-driver.json
```

## Run with k6

Stop the capture port-forward before starting a replay. Speedscale can replace the application pod while it attaches mocks, which disconnects an existing port-forward. The included driver helper starts a new port-forward after `mocks-ready`. Set `SUT_URL` to a stable ingress instead when one is available.

```bash
export CLUSTER=<cluster-name>
export NAMESPACE=replay-sandwich
export SERVICE=node-server
export SNAPSHOT_ID
export SUT_URL=http://127.0.0.1:3000

./run-replay-sandwich.sh -- \
  ./drivers/run-with-port-forward.sh -- \
    k6 run --env BASE_URL="$SUT_URL" drivers/k6/replay.js
```

k6 thresholds make assertion and HTTP failures return a nonzero exit code.

## Run with Postman

Lint the Native Git-compatible v3 collection before running it.

```bash
postman collection lint \
  postman/collections/replay-sandwich \
  --fail-severity warning

./run-replay-sandwich.sh -- \
  ./drivers/run-with-port-forward.sh -- \
    postman collection run postman/collections/replay-sandwich \
      --env-var "baseUrl=$SUT_URL" \
      --bail \
      --timeout 120000
```

Local collection runs do not require a Postman login. Collection v3 currently supports the CLI reporter, so preserve the job log as the test artifact.

## Use another driver

Pass any executable and its arguments after `--`:

```bash
./run-replay-sandwich.sh -- your-test-command --target "$SUT_URL"
```

The wrapper starts a responder-only replay, waits for `mocks-ready`, runs the command, and cancels the replay on success, failure, or interruption. The driver's exit code remains the CI result.

## Verify the reference drivers

The local verification uses a fixture server and does not require a cluster or Speedscale credentials.

```bash
thoughts/scripts/verify-replay-sandwich.sh
```
