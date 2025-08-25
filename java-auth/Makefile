VERSION?=$(shell cat ../VERSION 2>/dev/null || echo "1.0.0")
REGISTRY?=gcr.io/speedscale-demos/java-auth:${VERSION}
CLIENT_REGISTRY?=gcr.io/speedscale-demos/java-auth-client:${VERSION}
NAMESPACE?=default

.PHONY: help build test run up down client local compose kube docker-build docker-multi

help: ## Show available commands
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\\033[36m%-15s\\033[0m %s\\n", $$1, $$2}'

build: ## Build the application
	cd server && mvn clean package -DskipTests

test: ## Run tests
	cd server && mvn test

local: ## Run locally (needs MySQL)
	cd server && mvn spring-boot:run

run: local ## Alias for local

up: ## Start with Docker Compose
	docker-compose up -d

down: ## Stop containers
	docker-compose down

compose: up ## Alias for up

client: ## Run test client
	./client/client

kube: ## Deploy to Kubernetes
	kubectl -n ${NAMESPACE} apply -k k8s/base

kube-clean: ## Remove from Kubernetes
	kubectl -n ${NAMESPACE} delete -k k8s/base

docker-build: ## Build Docker images locally
	docker build -t java-auth:$(VERSION) ./server
	docker build -t java-auth-client:$(VERSION) ./client

docker-multi: ## Build and push multi-arch images
	docker buildx build --push --platform linux/amd64,linux/arm64 --tag ${REGISTRY} -f ./server/Dockerfile ./server
	docker buildx build --push --platform linux/amd64,linux/arm64 --tag ${CLIENT_REGISTRY} -f ./client/Dockerfile ./client