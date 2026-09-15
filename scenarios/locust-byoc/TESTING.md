# Validation

Validated on 2026-09-15 using an arm64 minikube cluster with Kubernetes v1.35.1.

- Speedscale goproxy v2.5.998 captured real inbound quote requests and outbound catalog calls through separate proxy sidecars.
- A dedicated Speedscale forwarder v2.5.980 sent the records through an OTel collector to a MinIO S3-compatible BYOC bucket. The BYOC exporter used `filter_rule: standard`; omitting the rule dropped the records in this forwarder path.
- The Locust-enabled proxymock build imported 10 RRPairs from the bucket: five inbound requests and five outbound dependency responses. There were no malformed records.
- `proxymock export locust --service quote-capture` produced five requests. The mock image used the unchanged proxymock v2.5.978 release and initialized with a runtime Kubernetes Secret.
- With the catalog scaled to zero, the Locust 2.46.5 Job completed 700 requests in 30 seconds with zero failures. Five users ran against the test deployment through `--host`. A separate body assertion confirmed `{"sku": "widget", "total": 42}`.
- Negative control: with the catalog and mock deployments both scaled to zero, the same generated test reported `Expected status 200, got 502` and the Kubernetes Job failed. The mock deployment was restored after the check.

This run validates a small HTTP capture and an S3-compatible bucket. It does not establish production load capacity, native GCS behavior, or database-protocol export support. The mock image packages traffic for a small demo; large recordings should use a mounted volume.
