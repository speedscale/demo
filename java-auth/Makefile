VERSION?=$(shell cat ../VERSION 2>/dev/null || echo "1.0.0")
REGISTRY?=gcr.io/speedscale-demos/java-auth:v${VERSION}
CLIENT_REGISTRY?=gcr.io/speedscale-demos/java-auth-client:v${VERSION}
NAMESPACE?=default

.PHONY: help build test run up down client local compose kube docker-build docker-multi fast-lane fast-lane-mitigation fast-lane-matrix fast-lane-record

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
	docker compose up -d

down: ## Stop containers
	docker compose down

compose: up ## Alias for up

client: ## Run test client
	./client/client

kube: ## Deploy to Kubernetes
	kubectl -n ${NAMESPACE} apply -k k8s/base

kube-clean: ## Remove from Kubernetes
	kubectl -n ${NAMESPACE} delete -k k8s/base

kube-statefulset: ## Deploy to Kubernetes as StatefulSet
	kubectl -n ${NAMESPACE} apply -k k8s/overlays/statefulset

kube-statefulset-clean: ## Remove StatefulSet deployment
	kubectl -n ${NAMESPACE} delete -k k8s/overlays/statefulset
	@echo "Delete PVCs manually if desired: kubectl -n ${NAMESPACE} delete pvc -l app=java-auth"

docker-build: ## Build Docker images locally
	docker build -t java-auth:$(VERSION) ./server
	docker build -t java-auth-client:$(VERSION) ./client

docker-multi: ## Build and push multi-arch images
	docker buildx build --push --platform linux/amd64,linux/arm64 --tag ${REGISTRY} -f ./server/Dockerfile ./server
	docker buildx build --push --platform linux/amd64,linux/arm64 --tag ${CLIENT_REGISTRY} -f ./client/Dockerfile ./client

FAST_LANE_DEPLOYED?=21.0.12
FAST_LANE_PATCHED?=21.0.13

fast-lane-image-%:
	docker build -q --build-arg CORRETTO_TAG=$* -t java-auth-fast-lane:$* ./server

fast-lane: fast-lane-image-$(FAST_LANE_PATCHED) fast-lane-image-$(FAST_LANE_DEPLOYED) ## Check the patched JDK image against the deployed one
	./fast-lane-check.sh java-auth-fast-lane:$(FAST_LANE_PATCHED) java-auth-fast-lane:$(FAST_LANE_DEPLOYED)

fast-lane-mitigation: fast-lane-image-$(FAST_LANE_DEPLOYED) ## Check the deployed image with the CVE mitigation flag
	JAVA_TOOL_OPTIONS=-XX:-UseBASE64Intrinsics ./fast-lane-check.sh java-auth-fast-lane:$(FAST_LANE_DEPLOYED) java-auth-fast-lane:$(FAST_LANE_DEPLOYED)

fast-lane-matrix: ## Check a set of JDK and library upgrades, plus three controls
	./fast-lane-matrix.sh

fast-lane-record: fast-lane-image-$(FAST_LANE_DEPLOYED) ## Re-record the traffic against the deployed image
	./fast-lane-record.sh java-auth-fast-lane:$(FAST_LANE_DEPLOYED)
