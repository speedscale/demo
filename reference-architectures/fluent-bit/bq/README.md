# BigQuery + Data Studio layer for the Fluent Bit data lake

Fluent Bit ships RRPair logs to GCS as Hive-partitioned NDJSON. This
directory wires that bucket into BigQuery as an **external table** (no data
duplication, no BigQuery storage cost) and a **flattened view** that's
ready to drop into Data Studio.

```
GCS bucket  ──(external table, no copy)──>  BigQuery
                                                │
                                                ├──▶  rrpair_ext   (raw + JSON columns)
                                                │
                                                └──▶  rrpair_view  (flat columns for BI)
                                                                │
                                                                ▼
                                                         Data Studio
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
   into flat typed columns. This is what Data Studio talks to.

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

## Visualize in Data Studio

**Reference dashboard** (built against the canonical demo bucket
`gs://speedscale-rrpair-demo`):

> https://datastudio.google.com/reporting/74795188-ddc0-41ac-ad5a-d53df0d1b022

Viewers need either `roles/bigquery.dataViewer` on the
`speedscale-demos.speedscale_rrpair` dataset, OR the dashboard owner
sets the data source to use "Owner's credentials" so any link viewer
can see the data.

To build your own (against your own bucket):

1. Go to https://datastudio.google.com and sign in.
2. Click **Create** → **Report** (or "Blank Report").
3. In the "Add data to report" panel, search/pick the **BigQuery**
   connector. Authorize it on first use.
4. Browse to your project → `speedscale_rrpair` → `rrpair_view` → **Add**.

You're now in the report editor with `rrpair_view`'s columns available
in the right-hand fields pane.

> **Why no deep-link?** Data Studio's Linking API can only deep-link
> into pre-existing *template* reports (cloning a template + overriding
> its data sources by alias — `ds.ds0.*` refers to a `ds0` alias the
> template already has). There's no documented form for "create a
> brand-new blank report with this data source pre-attached," so we
> use the manual add-data flow above. If/when Speedscale publishes a
> public Data Studio template report, a deep-link clone URL becomes
> possible.

### Starter dashboard — click-by-click

You should be in an empty report editor with `rrpair_view` connected as
the data source. The right pane lists every column under "Available
fields." The center is your canvas. Build the six widgets below; each
takes 20-40 seconds.

**1. Date-range control** *(always add this first — every chart honors it)*

- Top toolbar: **Add a control** → **Date range control**.
- Drag it to the top of the canvas.
- In the right pane: **Date range dimension** = `request_time`.
- Set "Default date range" to **Last 7 days** (or whatever fits).

**2. Service filter (drop-down)**

- Toolbar: **Add a control** → **Drop-down list**.
- Place it next to the date-range control.
- Control field: `app_label`.
- Lets viewers scope the whole dashboard to one service.

**3. Requests over time** *(time-series line chart)*

- Toolbar: **Add a chart** → under "Time series" pick the plain line chart.
- Drag a rectangle on the canvas (≈ full width, ¼ height).
- Right pane:
  - **Date range dimension**: `request_time`
  - **Dimension**: `request_time` (it will auto-bucket by hour; change to
    "Date Hour" if you want explicit control)
  - **Metric**: drag in `Record Count` (auto-generated)
- Optional: **Breakdown dimension** = `status_code` to color-split lines.

**4. Status code breakdown** *(donut)*

- **Add a chart** → "Pie chart" → pick the donut variant.
- Place top-right, square.
- **Dimension**: `status_code`
- **Metric**: `Record Count`
- In the **Style** tab: turn on "Show labels" → "Percentage".

**5. Top endpoints** *(table)*

- **Add a chart** → "Table".
- Place under the time-series chart, ~⅔ width.
- **Dimensions** (in order): `host`, `path`, `method`
- **Metrics**:
  - `Record Count` — rename to "Requests" in the Style tab
  - `duration_ms` with **aggregation = Average** — rename to "Avg ms"
- Sort: by Requests, **Descending**. Rows per page: 25.

**6. Latency percentiles** *(three scorecards side-by-side)*

For each scorecard:
- **Add a chart** → "Scorecard".
- Place three small cards in a row beside the donut.
- **Metric**: `duration_ms`. Click the metric → **Aggregation: Custom →
  APPROX_QUANTILES** is not available in the UI, so use this trick:
  - Click the metric pencil icon → switch to a **Calculated field**:
    - p50: `APPROX_QUANTILES(duration_ms, 100)[OFFSET(50)]`
    - p95: `APPROX_QUANTILES(duration_ms, 100)[OFFSET(95)]`
    - p99: `APPROX_QUANTILES(duration_ms, 100)[OFFSET(99)]`
  - Name each one accordingly; they appear back in the field list and
    can be reused across charts.
- Label each card "p50 ms", "p95 ms", "p99 ms" in the **Style** tab.

**7. By service** *(stacked horizontal bar)*

- **Add a chart** → "Bar chart" → horizontal stacked.
- Place beside the table.
- **Dimension**: `app_label`
- **Breakdown dimension**: `status_code`
- **Metric**: `Record Count`
- Sort: by Record Count desc.

**8. Capture mode mix** *(pie, small)*

- **Add a chart** → "Pie chart".
- Place in a corner.
- **Dimension**: `capture_mode`
- **Metric**: `Record Count`
- Useful sanity check that the eBPF nettap is doing the work (you should
  see ~100% `eBPF`).

**Polish**

- Rename the report (top-left "Untitled Report") to something like
  "Speedscale RRPair Traffic".
- File → Report settings → Default data source: `rrpair_view`.
- **View** mode (top-right toggle) hides the editor chrome — that's
  what viewers see.

**Troubleshooting**

- **"There was a problem"** on a chart usually means the query is
  missing the partition filter. Right pane → "Filter" → add
  `year Equal to 2026` (or whatever range you want). The Date-range
  control set up in step 1 normally handles this through
  `request_time`, but if you build charts before the control is wired
  up, charts may fail until the control is added.
- Empty scorecards: the `APPROX_QUANTILES` calculated field needs
  `duration_ms` to be a Number; check that the column shows as `#` (not
  `Abc`) in the fields pane. If it's text, click the column → Type →
  Number.

### Sharing

Once the report exists in Data Studio, share it like any Google doc:
**File → Share → "Get link"** → set to your org or specific viewers. The
underlying BigQuery permissions still apply — viewers need at least
`roles/bigquery.dataViewer` on the dataset to render the charts.
