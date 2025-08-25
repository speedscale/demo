VERSION?=$(shell cat ../VERSION 2>/dev/null || echo "dev")
REGISTRY?=gcr.io/speedscale-demos/java-auth:${VERSION}
CLIENT_REGISTRY?=gcr.io/speedscale-demos/java-auth-client:${VERSION}

.PHONY: help build test run up down client docker-build docker-multi

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\\033[36m%-15s\\033[0m %s\\n", $$1, $$2}'

build: ## Build the application
	cd server && mvn clean package -DskipTests

test: ## Run tests
	cd server && mvn test

run: ## Run locally (needs MySQL)
	cd server && mvn spring-boot:run

up: ## Start with Docker Compose
	docker-compose up -d

down: ## Stop containers
	docker-compose down

client: ## Run test client
	./client/client

docker-build: ## Build Docker images
	docker build -t java-auth:$(VERSION) ./server
	docker build -t java-auth-client:$(VERSION) ./client

docker-multi: ## Build and push multi-arch images
	docker buildx build --push --platform linux/amd64,linux/arm64 --tag ${REGISTRY} -f ./server/Dockerfile ./server
	docker buildx build --push --platform linux/amd64,linux/arm64 --tag ${CLIENT_REGISTRY} -f ./client/Dockerfile ./client