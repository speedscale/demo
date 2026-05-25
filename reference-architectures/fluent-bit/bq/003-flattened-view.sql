-- 003 — Flattened view for BI tooling (Looker Studio, Sheets, etc.).
--
-- The raw `rrpair_ext` external table keeps nested objects as JSON columns
-- (http, tags, netinfo, signature) — efficient for storage but awkward in
-- drag-and-drop dashboards that don't speak JSON_VALUE. This view extracts
-- the common fields into flat typed columns so Looker Studio sees them as
-- ordinary dimensions/metrics.
--
-- Notes:
--   - `request_time` truncates the RRPair's nanosecond `ts` to microsecond
--     precision (BQ TIMESTAMP max precision) via regex strip.
--   - `status_code` SAFE-casts the string status to INT64 (so chart math
--     works) and returns NULL on non-numeric values rather than failing.
--   - Partition columns (year/month/day/hour) are passed through so
--     dashboards can build date filters without joining back to the table.

CREATE OR REPLACE VIEW `speedscale_rrpair.rrpair_view` AS
SELECT
  TIMESTAMP(REGEXP_REPLACE(ts, r'(\.\d{6})\d+', r'\1'))           AS request_time,
  service,
  namespace,
  cluster,
  command                                                          AS method,
  status,
  SAFE_CAST(status AS INT64)                                       AS status_code,
  location                                                         AS path,
  duration                                                         AS duration_ms,
  direction,
  l7protocol,
  -- HTTP request fields
  JSON_VALUE(http.req.host)                                        AS host,
  JSON_VALUE(http.req.url)                                         AS url,
  JSON_VALUE(http.req.version)                                     AS http_version,
  -- HTTP response fields
  JSON_VALUE(http.res.statusCode)                                  AS res_status_code,
  JSON_VALUE(http.res.contentType)                                 AS res_content_type,
  JSON_VALUE(http.res.headers["Content-Length"][0])                AS res_content_length,
  -- Tags (k8s metadata, capture mode)
  JSON_VALUE(tags.k8sAppLabel)                                     AS app_label,
  JSON_VALUE(tags.k8sAppPodName)                                   AS pod_name,
  JSON_VALUE(tags.k8sAppPodNamespace)                              AS pod_namespace,
  JSON_VALUE(tags.captureMode)                                     AS capture_mode,
  JSON_VALUE(tags.proxyId)                                         AS proxy_id,
  JSON_VALUE(tags.proxyVersion)                                    AS proxy_version,
  -- Identifiers
  uuid,
  -- Partition columns passed through for date filters in dashboards
  year, month, day, hour
FROM `speedscale_rrpair.rrpair_ext`;
