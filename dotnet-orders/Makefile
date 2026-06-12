VERSION ?= $(shell cat ../VERSION 2>/dev/null || echo "1.0.0")
IMAGE_NAME = dotnet-orders
REGISTRY = gcr.io/speedscale-demos
NAMESPACE ?= default

.PHONY: help build run local up down compose docker-build docker-multi test test-api test-capture record health kube kube-clean clean watch format

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

build: ## Build the application
	dotnet build -c Release

local: ## Run locally (listens on :8082 via appsettings.json)
	dotnet run

run: local ## Alias for local

up: ## Start with Docker Compose
	docker compose up -d

down: ## Stop containers
	docker compose down

compose: up ## Alias for up

docker-build: ## Build Docker image locally
	docker build -t $(IMAGE_NAME):$(VERSION) .

docker-multi: ## Build and push multi-arch images
	docker buildx build --push --platform linux/amd64,linux/arm64 \
		--tag $(REGISTRY)/$(IMAGE_NAME):v$(VERSION) \
		--tag $(REGISTRY)/$(IMAGE_NAME):latest \
		.

test-api: ## Run API test script against a running app (:8082)
	./scripts/test.sh

record: ## Record the order flow with proxymock (launches the app too — one window). Then run 'make test-capture' in another.
	proxymock record --app-port 8082 -- dotnet run

test-capture: ## Drive the order flow THROUGH the proxymock recorder (run while 'make record' is up)
	./scripts/test.sh localhost:4143

health: ## Check health endpoint
	curl -sf http://localhost:8082/healthz | jq .

kube: ## Deploy to Kubernetes
	kubectl -n $(NAMESPACE) apply -f k8s/base/

kube-clean: ## Remove from Kubernetes
	kubectl -n $(NAMESPACE) delete -f k8s/base/

clean: ## Clean build artifacts
	dotnet clean
	rm -rf bin/ obj/

watch: ## Run with hot reload (listens on :8082 via appsettings.json)
	dotnet watch run

format: ## Format code
	dotnet format
