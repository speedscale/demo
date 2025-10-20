# Makefile for .NET Weather Service
VERSION ?= $(shell cat ../VERSION 2>/dev/null || echo "1.2.4")
IMAGE_NAME = csharp-weather
REGISTRY = gcr.io/speedscale-demos
CLIENT_IMAGE_NAME = csharp-client

.PHONY: help
help: ## Show this help message
	@echo ".NET Weather Service Makefile"
	@echo ""
	@echo "Available commands:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.PHONY: local
local: ## Run the service locally
	dotnet run

.PHONY: restore
restore: ## Restore dependencies
	dotnet restore

.PHONY: build
build: restore ## Build the application
	dotnet build -c Release

.PHONY: test
test: ## Run tests
	@if [ -d "tests" ]; then \
		cd tests && dotnet test; \
	else \
		echo "No tests directory found. Skipping tests."; \
	fi

.PHONY: clean
clean: ## Clean build artifacts
	dotnet clean
	rm -rf bin/ obj/
	@if [ -d "tests" ]; then \
		cd tests && dotnet clean && rm -rf bin/ obj/; \
	fi
	@if [ -d "client" ]; then \
		cd client && dotnet clean && rm -rf bin/ obj/; \
	fi

.PHONY: docker
docker: ## Build Docker image
	docker build -t $(IMAGE_NAME):latest -t $(IMAGE_NAME):$(VERSION) .

.PHONY: docker-multi
docker-multi: ## Build and push multi-arch Docker images
	docker buildx build --platform linux/amd64,linux/arm64 \
		-t $(REGISTRY)/$(IMAGE_NAME):latest \
		-t $(REGISTRY)/$(IMAGE_NAME):v$(VERSION) \
		--push .

.PHONY: docker-client
docker-client: ## Build client Docker image
	@if [ -d "client" ]; then \
		docker build -f client/Dockerfile -t $(CLIENT_IMAGE_NAME):latest -t $(CLIENT_IMAGE_NAME):$(VERSION) ./client; \
	else \
		echo "No client directory found. Skipping client build."; \
	fi

.PHONY: docker-client-multi
docker-client-multi: ## Build and push multi-arch client Docker image
	@if [ -d "client" ]; then \
		docker buildx build --platform linux/amd64,linux/arm64 \
			-f client/Dockerfile \
			-t $(REGISTRY)/$(CLIENT_IMAGE_NAME):latest \
			-t $(REGISTRY)/$(CLIENT_IMAGE_NAME):v$(VERSION) \
			--push ./client; \
	else \
		echo "No client directory found. Skipping client build."; \
	fi

.PHONY: compose
compose: ## Run with docker-compose
	docker compose up --build

.PHONY: compose-down
compose-down: ## Stop docker-compose
	docker compose down

.PHONY: kube
kube: ## Deploy to Kubernetes
	kubectl apply -f manifest.yaml

.PHONY: kube-clean
kube-clean: ## Remove from Kubernetes
	kubectl delete -f manifest.yaml

.PHONY: client
client: ## Run test client locally
	@if [ -d "client" ]; then \
		cd client && dotnet run; \
	else \
		echo "No client directory found."; \
		echo "You can manually test the API with:"; \
		echo "  curl http://localhost:8080/health"; \
		echo "  curl http://localhost:8080/weatherforecast"; \
	fi

.PHONY: format
format: ## Format code
	dotnet format

.PHONY: watch
watch: ## Run with hot reload
	dotnet watch run
