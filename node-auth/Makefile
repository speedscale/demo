VERSION?=$(shell cat ../VERSION 2>/dev/null || echo "1.0.0")
REGISTRY?=gcr.io/speedscale-demos/node-auth:v${VERSION}
NAMESPACE?=default

.PHONY: build
build:
	@echo "Building Node Auth"
	@npm install

.PHONY: docker-multi
docker-multi:
	@echo "Building and pushing multi-arch Docker image"
	@docker buildx build --push --platform linux/amd64,linux/arm64 --tag ${REGISTRY} .
