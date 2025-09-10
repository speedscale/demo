# Smart Replace Demo Makefile

# Get version from parent VERSION file
VERSION := $(shell cat ../VERSION 2>/dev/null || echo "1.0.0")

# Docker registry configuration
DOCKER_REGISTRY := gcr.io/speedscale-demos
DOCKER_IMAGE := smart-replace-demo
DOCKER_TAG := $(DOCKER_REGISTRY)/$(DOCKER_IMAGE):v$(VERSION)

.PHONY: help build docker docker-multi test clean

help: ## Show this help message
	@echo "Smart Replace Demo Build Commands"
	@echo ""
	@echo "Current version: $(VERSION)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

build: ## Install dependencies
	npm install

docker: ## Build Docker image
	docker build -t $(DOCKER_TAG) .

docker-multi: ## Build and push multi-arch Docker image
	docker buildx build --platform linux/amd64,linux/arm64 \
		-t $(DOCKER_TAG) \
		--push \
		.

test: ## Run tests (placeholder for now)
	@echo "No tests configured yet"

clean: ## Clean build artifacts
	rm -rf node_modules
	rm -f package-lock.json