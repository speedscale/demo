#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
: "${KUBE_CONTEXT:?Set KUBE_CONTEXT to the test cluster}"
NAMESPACE="${NAMESPACE:-locust-byoc}"
PROXYMOCK="${PROXYMOCK:-proxymock}"
k() { kubectl --context "$KUBE_CONTEXT" -n "$NAMESPACE" "$@"; }
case "${1:-}" in
  capture)
    kubectl --context "$KUBE_CONTEXT" create namespace "$NAMESPACE" --dry-run=client -o yaml | kubectl --context "$KUBE_CONTEXT" apply -f -
    k create configmap locust-app --from-file=app.py --dry-run=client -o yaml | k apply -f -
    k apply -f capture.yaml
    if [[ -n "${FORWARDER_ADDR:-}" ]]; then
      k set env deployment/quote-capture --containers='capture*' FORWARDER_ADDR="$FORWARDER_ADDR"
    fi
    k rollout status deployment/catalog --timeout=180s
    k rollout status deployment/quote-capture --timeout=180s
    k run "seed-$(date +%s)" --rm -i --restart=Never --image=curlimages/curl:8.12.1 -- sh -ec 'for i in 1 2 3 4 5; do curl -fsS "http://quote-capture:8080/quote?sku=widget"; done'
    ;;
  export)
    : "${BUCKET:?Set BUCKET to the capture bucket}"
    : "${FROM:?Set FROM to the start of the capture window (RFC3339)}"
    : "${TO:?Set TO to the end of the capture window (RFC3339)}"
    args=(--bucket "$BUCKET" --prefix "${PREFIX:-byoc/}" --from "$FROM" --to "$TO" --namespace "$NAMESPACE" --out ./traffic)
    if [[ -n "${S3_ENDPOINT_URL:-}" ]]; then args+=(--s3-endpoint-url "$S3_ENDPOINT_URL" --s3-force-path-style); fi
    "$PROXYMOCK" import s3 "${args[@]}"
    "$PROXYMOCK" export locust --in ./traffic --service quote-capture --out locustfile.py
    ;;
  test)
    : "${MOCK_IMAGE:?Build and set MOCK_IMAGE using Dockerfile.mocks}"
    test -s locustfile.py
    k create configmap locust-test --from-file=locustfile.py --dry-run=client -o yaml | k apply -f -
    k create deployment mocks --image="$MOCK_IMAGE" --dry-run=client -o yaml | k apply -f -
    k expose deployment mocks --port=4140 --dry-run=client -o yaml | k apply -f -
    k set env deployment/mocks --from=secret/locust-proxymock
    k set env deployment/mocks SPEEDSCALE_APP_URL="${SPEEDSCALE_APP_URL:-app.speedscale.com}"
    k patch deployment mocks --type=json -p '[{"op":"add","path":"/spec/template/spec/containers/0/readinessProbe","value":{"httpGet":{"path":"/healthz","port":8082},"initialDelaySeconds":2,"periodSeconds":2}}]'
    k rollout status deployment/mocks --timeout=180s
    k scale deployment/catalog --replicas=0
    if [[ -n "$(k get pods -l app=locust-catalog -o name)" ]]; then
      k wait --for=delete pod -l app=locust-catalog --timeout=90s
    fi
    k delete job locust --ignore-not-found
    k apply -f test.yaml
    k rollout status deployment/quote-test --timeout=180s
    if ! k wait --for=condition=complete job/locust --timeout=180s; then
      k logs job/locust
      k logs deployment/mocks --tail=80
      exit 1
    fi
    k logs job/locust
    k exec deployment/quote-test -- python -c 'import json,urllib.request; data=json.load(urllib.request.urlopen("http://127.0.0.1:8080/quote?sku=widget")); assert data == {"sku":"widget","total":42}, data; print(data)'
    test -z "$(k get pods -l app=locust-catalog -o name)"
    ;;
  cleanup)
    k delete -f test.yaml --ignore-not-found
    k delete -f capture.yaml --ignore-not-found
    k delete deployment mocks --ignore-not-found
    k delete service mocks --ignore-not-found
    k delete configmap locust-app locust-test --ignore-not-found
    ;;
  *) echo "Usage: $0 capture|export|test|cleanup" >&2; exit 2 ;;
esac
