## Java Demo

This is a Java Spring Boot app that makes requests to the existing [CNCF projects API](https://demo-api.trafficreplay.com) and the [US Treasury API](https://fiscaldata.treasury.gov/api-documentation/). The Speedscale documentation also includes a [full walkthrough](https://docs.speedscale.com/tutorial/) of using this demo.

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

- `/api/projects` - CNCF projects
- `/api/project` - random project ID in `project_id`
- `/api/projects/{id}` - project details
- `/api/categories` - project categories
- `/treasury/max_interest` - security with max interest this year

The downstream defaults to `https://demo-api.trafficreplay.com` and uses its existing `/v1/projects`, `/v1/project/{id}`, and `/v1/categories` routes. Set `DEMO_CNCF_BASE_URL=https://demo-api-dev.trafficreplay.com` for development, or point it at mock-lab's local reference server. `DEMO_CNCF_TIMEOUT` defaults to `5s`. No additional backend data or service is needed. Requests remain real outbound HTTP calls for capture and mocking. Missing projects return 404, invalid or unavailable backend responses return 502, and timeouts return 504.

The legacy URLs remain aliases: `/spacex/launches` returns the CNCF project list, `/spacex/ship` returns a random project slug in `ship_id`, and `/spacex/ship/{id}` returns a project by slug. SpaceX-shaped response bodies and SpaceX ship IDs are replaced by CNCF data. The client and Postman collection use the CNCF URLs and project IDs such as `kubernetes`, `prometheus`, and `envoy`.

Run `cd server && ./mvnw test` for the downstream contract and failure checks. The traffic client checks HTTP failures, applies request deadlines, refreshes tokens every five loops, and never prints token values.
