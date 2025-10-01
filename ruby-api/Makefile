VERSION?=$(shell cat ../VERSION 2>/dev/null || echo "1.1.7")
SERVER_REGISTRY?=gcr.io/speedscale-demos/ruby-api:v${VERSION}
CLIENT_REGISTRY?=gcr.io/speedscale-demos/ruby-client:v${VERSION}
NAMESPACE?=default

.PHONY: build
build:
	@echo "Building Ruby API"
	@bundle install

.PHONY: build-client
build-client:
	@echo "Building Ruby Client"
	@cd client && bundle install

.PHONY: docker-multi
docker-multi:
	@echo "Building and pushing multi-arch server Docker image"
	@docker buildx build --push --platform linux/amd64,linux/arm64 --tag ${SERVER_REGISTRY} .

.PHONY: docker-client
docker-client:
	@echo "Building and pushing multi-arch client Docker image"
	@cd client && docker buildx build --push --platform linux/amd64,linux/arm64 --tag ${CLIENT_REGISTRY} .

.PHONY: docker-all
docker-all: docker-multi docker-client
