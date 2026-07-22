#!/usr/bin/env bash
# Proves the external-driver lifecycle and both reference drivers work locally.
# Created: 2026-07-22 for the replay sandwich reference scenario.

set -euo pipefail

REPO_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
SCENARIO_DIR="$REPO_ROOT/scenarios/replay-sandwich"

"$SCENARIO_DIR/test/test-orchestration.sh"
"$SCENARIO_DIR/test/verify-drivers.sh"

kubectl kustomize "$SCENARIO_DIR/k8s" >/dev/null

echo "PASS: replay sandwich reference scenario passed local verification"
