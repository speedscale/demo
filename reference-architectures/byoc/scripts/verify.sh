#!/usr/bin/env bash
# Verify that RRPair data is flowing from Speedscale to Fluent Bit.
# Run from the byoc/ directory: ./scripts/verify.sh
set -euo pipefail

echo "==> Pods — speedscale namespace:"
kubectl -n speedscale get pods
echo ""

echo "==> Pods — observability namespace:"
kubectl -n observability get pods
echo ""

echo "==> Fluent Bit logs (last 30 lines):"
kubectl -n observability logs deploy/fluent-bit --tail=30
echo ""

echo "Tip: stream live traffic with:"
echo "  kubectl -n observability logs -f deploy/fluent-bit"
