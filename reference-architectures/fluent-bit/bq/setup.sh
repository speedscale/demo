#!/usr/bin/env bash
# Set up BigQuery dataset + external table + view over the Fluent Bit GCS
# data lake. Run once per (project, bucket) pair.
#
# Usage:
#   ./setup.sh <project-id> <bucket-name>
#
# Example:
#   ./setup.sh speedscale-demos speedscale-rrpair-demo
#
# Idempotent: re-running rebuilds the external table + view in place
# (CREATE OR REPLACE). Safe to re-run after schema tweaks.

set -euo pipefail

PROJECT_ID="${1:-}"
BUCKET="${2:-}"

if [[ -z "${PROJECT_ID}" || -z "${BUCKET}" ]]; then
  echo "Usage: $0 <project-id> <bucket-name>" >&2
  exit 2
fi

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Creating dataset speedscale_rrpair in ${PROJECT_ID} (us-central1)..."
bq --project_id="${PROJECT_ID}" query --use_legacy_sql=false --quiet \
  < "${DIR}/001-dataset.sql"

echo "==> Creating external table rrpair_ext over gs://${BUCKET}/..."
# 002 references the bucket by literal name; substitute on the fly.
sed "s|speedscale-rrpair-demo|${BUCKET}|g" "${DIR}/002-external-table.sql" \
  | bq --project_id="${PROJECT_ID}" query --use_legacy_sql=false --quiet

echo "==> Creating flattened view rrpair_view..."
bq --project_id="${PROJECT_ID}" query --use_legacy_sql=false --quiet \
  < "${DIR}/003-flattened-view.sql"

echo
echo "Done. Verify with:"
echo "  bq --project_id=${PROJECT_ID} ls speedscale_rrpair"
echo
echo "Sample query (requires the partition filter):"
echo "  bq --project_id=${PROJECT_ID} query --use_legacy_sql=false \\"
echo "    'SELECT method, status_code, COUNT(*) c"
echo "     FROM \`${PROJECT_ID}.speedscale_rrpair.rrpair_view\`"
echo "     WHERE year=2026 AND month=5"
echo "     GROUP BY method, status_code"
echo "     ORDER BY c DESC'"
echo
echo "BigQuery console:"
echo "  https://console.cloud.google.com/bigquery?project=${PROJECT_ID}&ws=!1m4!1m3!3m2!1s${PROJECT_ID}!2sspeedscale_rrpair"
echo
echo "Open in Data Studio (creates a new report wired to rrpair_view):"
echo "  https://datastudio.google.com/reporting/create?c.reportId=&ds.ds0.connector=bigQuery&ds.ds0.projectId=${PROJECT_ID}&ds.ds0.type=TABLE&ds.ds0.datasetId=speedscale_rrpair&ds.ds0.tableId=rrpair_view"
