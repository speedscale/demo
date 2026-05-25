# BigQuery + Looker Studio layer for the Fluent Bit data lake

Fluent Bit ships RRPair logs to GCS as Hive-partitioned NDJSON. This
directory wires that bucket into BigQuery as an **external table** (no data
duplication, no BigQuery storage cost) and a **flattened view** that's
ready to drop into Looker Studio.

```
GCS bucket  ──(external table, no copy)──>  BigQuery
                                                │
                                                ├──▶  rrpair_ext   (raw + JSON columns)
                                                │
                                                └──▶  rrpair_view  (flat columns for BI)
                                                                │
                                                                ▼
                                                         Looker Studio
```

## Cost

External tables incur **zero BigQuery storage cost** — BQ reads directly
from GCS at query time. You pay only for bytes scanned (`$6.25 / TB`), with
the **first 1 TB per month free**. At demo-scale volumes (KB–MB), every
query rounds to $0.

The `require_hive_partition_filter = TRUE` option on the table forces
every query to include `WHERE year=… AND month=…` (and ideally `day` /
`hour`) — without it, queries fail rather than full-scan the bucket. This
is the safety belt against accidental large scans if the bucket grows.

## Setup

One-time, per `(project, bucket)`:

```bash
./setup.sh <project-id> <bucket-name>
```

Example for the canonical demo bucket:

```bash
./setup.sh speedscale-demos speedscale-rrpair-demo
```

The script runs the three SQL files in order:

1. **`001-dataset.sql`** — creates the `speedscale_rrpair` dataset in
   `us-central1` (matches the bucket region so queries don't cross-region).
2. **`002-external-table.sql`** — creates `rrpair_ext` over the bucket,
   declaring an explicit schema. Nested fields stay as `JSON` columns;
   unknown fields (`@timestamp`, `__internal__` — both have characters BQ
   can't use as column names) are silently ignored via
   `ignore_unknown_values = TRUE`.
3. **`003-flattened-view.sql`** — creates `rrpair_view` that pre-extracts
   the commonly-queried fields (host, path, status_code, app_label, etc.)
   into flat typed columns. This is what Looker Studio talks to.

Re-running the script is safe — every statement is `CREATE OR REPLACE` /
`CREATE SCHEMA IF NOT EXISTS`.

## Query examples

Raw table — drop into the deep JSON for one-off questions:

```sql
-- Status code mix per service for a given day
SELECT
  service,
  status,
  COUNT(*) AS reqs,
  ROUND(AVG(duration), 2) AS avg_dur_ms
FROM `speedscale_rrpair.rrpair_ext`
WHERE year=2026 AND month=5 AND day=25
GROUP BY service, status
ORDER BY reqs DESC;

-- Drill into JSON: top URL paths
SELECT
  JSON_VALUE(http.req.url) AS url,
  COUNT(*) AS hits
FROM `speedscale_rrpair.rrpair_ext`
WHERE year=2026 AND month=5 AND day=25
GROUP BY url
ORDER BY hits DESC
LIMIT 20;
```

Flattened view — for dashboards and routine queries:

```sql
-- Latency percentiles per endpoint
SELECT
  host,
  path,
  APPROX_QUANTILES(duration_ms, 100)[OFFSET(50)] AS p50,
  APPROX_QUANTILES(duration_ms, 100)[OFFSET(95)] AS p95,
  APPROX_QUANTILES(duration_ms, 100)[OFFSET(99)] AS p99,
  COUNT(*) AS reqs
FROM `speedscale_rrpair.rrpair_view`
WHERE year=2026 AND month=5 AND day=25
GROUP BY host, path
ORDER BY reqs DESC;
```

## Visualize in Looker Studio

Looker Studio is free; the connector to BigQuery is built in. Two ways
to start:

1. **Pre-wired link** (data source already pointed at `rrpair_view`):

   ```
   https://lookerstudio.google.com/reporting/create?c.reportId=&ds.ds0.connector=bigQuery&ds.ds0.projectId=<PROJECT_ID>&ds.ds0.type=TABLE&ds.ds0.datasetId=speedscale_rrpair&ds.ds0.tableId=rrpair_view
   ```

   `setup.sh` prints this URL with your project filled in.

2. **From scratch** — go to https://lookerstudio.google.com → Blank
   Report → Add data → BigQuery → pick `rrpair_view`.

### Suggested charts

A useful starter dashboard for traffic exploration (5 minutes of drag-and-
drop in the UI):

| Chart | Type | Dimension(s) | Metric |
|---|---|---|---|
| **Requests over time** | Time-series | `request_time` (by hour) | Record Count |
| **Status code breakdown** | Pie / donut | `status_code` | Record Count |
| **Top endpoints** | Table | `host`, `path`, `method` | Record Count, AVG(`duration_ms`) |
| **Latency p50/p95/p99** | Scorecard ×3 | — | Percentile(`duration_ms`) at 50/95/99 |
| **By service** | Stacked bar | `app_label`, `status_code` | Record Count |
| **Capture mode mix** | Pie | `capture_mode` (eBPF vs sidecar) | Record Count |

Add a **date range control** on `request_time` and a **drop-down filter**
on `app_label` so viewers can scope the dashboard to one service.

### Sharing

Once the report exists in Looker Studio, share it like any Google doc:
**File → Share → "Get link"** → set to your org or specific viewers. The
underlying BigQuery permissions still apply — viewers need at least
`roles/bigquery.dataViewer` on the dataset to render the charts.
