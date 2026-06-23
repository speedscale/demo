VERSION?=$(shell cat ../VERSION 2>/dev/null || echo "1.0.0")
REGISTRY?=gcr.io/speedscale-demos/sessions-demo:v${VERSION}
PORT?=3000
BASE?=http://localhost:4143

.PHONY: build
build:
	@echo "sessions-demo has no dependencies; nothing to build"

.PHONY: start
start:
	@PORT=$(PORT) node server.js

.PHONY: drive
drive:
	@BASE=$(BASE) node client/drive.js

.PHONY: record
record:
	@echo "Recording sessions-demo with proxymock (proxy on :4143, app on :$(PORT))"
	@PORT=$(PORT) proxymock record --app-port $(PORT) -- npm start

.PHONY: docker-multi
docker-multi:
	@echo "Building and pushing multi-arch Docker image"
	@docker buildx build --push --platform linux/amd64,linux/arm64 --tag ${REGISTRY} .
