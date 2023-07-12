## Java Demo

This is a Java Spring Boot app that makes makes requests to the [SpaceX API](https://github.com/r-spacex/SpaceX-API/tree/master) and the [US Treasury API](https://fiscaldata.treasury.gov/api-documentation/).

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

- `/spacex/launches` - latest launches
- `/spacex/ship/{id}` - ship status
- `/treasury/max_interest` - security with max interest this year
