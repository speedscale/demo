-- 001 — BigQuery dataset for the Fluent Bit RRPair data lake.
--
-- Colocated in the same region as the GCS bucket (us-central1) so external
-- table queries don't incur cross-region egress. No native BigQuery storage
-- ever lives here — only external tables that read directly from GCS.
--
-- Run with:
--   bq --project_id=<your-project> query --use_legacy_sql=false < 001-dataset.sql

CREATE SCHEMA IF NOT EXISTS speedscale_rrpair
OPTIONS (
  location = 'us-central1',
  description = 'External tables over the Fluent Bit BYOC RRPair data lake. Schema is external-only — no native BigQuery storage cost; queries pay only for bytes scanned in GCS (with the 1 TB/month free tier).'
);
