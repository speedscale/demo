# Gateway for Java + .NET + Node microservices scenario.
# Version and image tag follow repo root VERSION (see AGENTS.md).
VERSION ?= $(shell cat ../../../VERSION 2>/dev/null || echo "1.0.0")
REGISTRY ?= gcr.io/speedscale-demos/scenarios-gateway:v$(VERSION)

.PHONY: build docker-multi
build:
	npm install

docker-multi: ## Build and push gateway image (use from root: make docker-gateway)
	docker buildx build --push --platform linux/amd64,linux/arm64 --tag $(REGISTRY) .
