#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
PROFILE="${PROFILE:-minikube}"
KUBE_CONTEXT="${KUBE_CONTEXT:-$PROFILE}"
K=(kubectl --context "$KUBE_CONTEXT" -n airline-demo)

case "${1:-status}" in
  build)
    minikube -p "$PROFILE" image build --build-opt target=booking-api -t dotnet-airline-api:local .
    minikube -p "$PROFILE" image build --build-opt target=partners -t dotnet-airline-partners:local .
    ;;
  deploy)
    kubectl --context "$KUBE_CONTEXT" apply -f k8s/minikube.yaml
    "${K[@]}" rollout restart deployment/airline-partners deployment/airline-booking-api
    for workload in airline-redis airline-partners airline-booking-api; do
      "${K[@]}" rollout status "deployment/$workload" --timeout=120s
    done
    ;;
  traffic)
    "${K[@]}" run "airline-traffic-$(date +%s)-$$" --stdin --attach --rm --restart=Never \
      --image=python:3.12-alpine --pod-running-timeout=120s \
      --overrides='{"spec":{"automountServiceAccountToken":false,"securityContext":{"runAsNonRoot":true,"runAsUser":1000}}}' \
      --env="TRAVEL_DATE=${TRAVEL_DATE:-2026-12-18}" \
      --command -- python3 - http://airline-booking-api:8090 < demo/drive-cluster.py
    ;;
  status)
    "${K[@]}" get deployments,pods,services
    ;;
  *) echo "usage: $0 build|deploy|traffic|status" >&2; exit 2 ;;
esac
