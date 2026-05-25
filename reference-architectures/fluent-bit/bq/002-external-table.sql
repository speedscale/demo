-- 002 — External table over the Hive-partitioned GCS bucket.
--
-- Fluent Bit writes gs://<bucket>/year=YYYY/month=MM/day=DD/hour=HH/<uuid>.json.gz
-- One OTLP LogRecord per NDJSON line, with the RRPair body flattened to the
-- top level (FB's `s3` JSON output emits records that way).
--
-- Schema notes:
--   - `@timestamp` and `__internal__` are present in each JSON record but
--     omitted from the schema (BQ column names can't start with `@` or
--     contain dots). `ignore_unknown_values = TRUE` makes BQ skip them
--     silently rather than reject the row.
--   - Nested objects (http, tags, netinfo, signature) land as JSON type so
--     ad-hoc queries can drill in via JSON_VALUE / dot accessors. The
--     `rrpair_view` (003) pre-extracts the common fields for BI tooling.
--   - `require_hive_partition_filter = TRUE` is a safety belt: every query
--     MUST include `WHERE year=… AND month=…` (and ideally day/hour).
--     Without it, queries fail rather than full-scan the bucket.
--
-- Set the @bucket and @project_id query parameters at run time:
--   bq query --use_legacy_sql=false \
--      --parameter='project_id::your-project' \
--      --parameter='bucket::your-bucket' \
--      < 002-external-table.sql
--
-- Or substitute inline before running.

CREATE OR REPLACE EXTERNAL TABLE `speedscale_rrpair.rrpair_ext` (
  service      STRING,
  namespace    STRING,
  cluster      STRING,
  command      STRING,                -- HTTP method
  status       STRING,                -- HTTP status as string ("200")
  location     STRING,                -- URL path
  duration     FLOAT64,               -- ms
  direction    STRING,                -- IN / OUT
  msgType      STRING,                -- always "rrpair"
  tech         STRING,                -- payload tech (JSON, etc.)
  l7protocol   STRING,                -- http, grpc, etc.
  resource     STRING,
  uuid         STRING,                -- base64 16-byte RRPair UUID
  ts           STRING,                -- RFC3339 nanosecond timestamp
  dlpModified  BOOL,
  dlpRule      STRING,
  http         JSON,                  -- {req, res}
  tags         JSON,                  -- k8s pod/app metadata
  netinfo      JSON,                  -- upstream/downstream IP:port
  signature    JSON                   -- proxymock signature
)
WITH PARTITION COLUMNS (
  year   INT64,
  month  INT64,
  day    INT64,
  hour   INT64
)
OPTIONS (
  format = 'JSON',
  uris = ['gs://speedscale-rrpair-demo/*'],
  hive_partition_uri_prefix = 'gs://speedscale-rrpair-demo/',
  require_hive_partition_filter = TRUE,
  ignore_unknown_values = TRUE,
  description = 'Speedscale RRPair traffic shipped by Fluent Bit (gs://speedscale-rrpair-demo). Hive-partitioned by year/month/day/hour. Every query MUST filter by partition.'
);
