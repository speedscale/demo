## Java Demo

This is a Java Spring Boot app that makes requests to a [Speedscale-owned static backend](https://demo-api.trafficreplay.com) serving archived SpaceX API data and the [US Treasury API](https://fiscaldata.treasury.gov/api-documentation/). The Speedscale documentation also includes a [full walkthrough](https://docs.speedscale.com/tutorial/) of using this demo.

### Tools used

Different parts of this project can be run without installing everything listed here. For eg. the Docker mode can be run without installing Java and conversely the local version can be run without installing Docker. All modes are listed [here](#Running).

- `jq`
- `curl`
- `docker` with `compose`
- `kubectl`
- `java`
- `mvn`

### Running

The `Makefile` contains entrypoint for many ways you can run this demo app:

- `make local` runs the app locally on port 8080
- `make compose` runs the app in docker compose and forwards port 8080
- `make kube` deploys the app to the current Kubernetes context and default namespace which can be overridden with `NAMESPACE={your namespace}`
- `make kube-clean` deletes everything created by `make kube`
- `make client` runs a client script that exercises the endpoints listed below

### Endpoints

A Postman collection with full examples is available in `postman-collection.json`.

Unauthenticated

- `/healthz` - health check
- `/login` - username+password exchanged for a JWT

Authenticated with header `Authorization: Bearer {JWT}`

- `/spacex/launches` - latest launch in the archived snapshot
- `/spacex/ship/{id}` - ship status
- `/treasury/max_interest` - security with max interest this year

The `/spacex/*` endpoints retain the original response shapes and ship IDs. The downstream defaults to `https://demo-api.trafficreplay.com/spacex`; it serves a frozen December 2023 snapshot. Set `DEMO_SPACEX_BASE_URL=https://demo-api-dev.trafficreplay.com/spacex` for development, or use a local compatibility server. `DEMO_SPACEX_TIMEOUT` defaults to `5s`. Requests remain real outbound HTTP calls for capture and mocking. Missing data returns 404, invalid or unavailable backend responses return 502, and timeouts return 504.

Run `cd server && ./mvnw test` for the downstream contract and failure checks. The traffic client checks HTTP failures, applies request deadlines, refreshes tokens every five loops, and never prints token values.
