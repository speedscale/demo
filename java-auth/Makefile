# Java Authentication Microservice Makefile
# Provides common development tasks and workflows

# Version from git tags, with fallback to commit hash
VERSION?=$(shell cat ../VERSION 2>/dev/null || git describe --tags --always --dirty 2>/dev/null || echo "dev")
REGISTRY?=gcr.io/speedscale-demos/java-auth:${VERSION}
CLIENT_REGISTRY?=gcr.io/speedscale-demos/java-auth-client:${VERSION}

.PHONY: help build test clean run dev up down logs lint format deps docker-build docker-run docker-clean docker-multi
# Note: version and tag targets removed - use root Makefile for version management

# Maven wrapper detection
MVN := $(shell if [ -f ./mvnw ]; then echo "./mvnw"; else echo "mvn"; fi)

# Default target
help: ## Show this help message
	@echo "Java Authentication Microservice - Available Commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

# Development Commands
build: ## Build the application JAR
	cd server && $(MVN) clean package -DskipTests

test: ## Run all tests
	cd server && $(MVN) test

test-coverage: ## Run tests with coverage report
	cd server && $(MVN) clean test jacoco:report

clean: ## Clean build artifacts
	cd server && $(MVN) clean

run: ## Run the application locally (requires MySQL)
	cd server && $(MVN) spring-boot:run

# Docker Commands
dev: up ## Alias for 'up' - start development environment

up: ## Start MySQL and application containers
	docker-compose up -d

down: ## Stop all containers
	docker-compose down

logs: ## Show container logs
	docker-compose logs -f

logs-app: ## Show application logs only
	docker-compose logs -f auth-service

logs-db: ## Show database logs only
	docker-compose logs -f mysql

# Docker Image Commands
docker-build: ## Build Docker image with version tag
	docker build -t java-auth:$(VERSION) .
	docker tag java-auth:$(VERSION) java-auth:latest
	@echo "Built image: java-auth:$(VERSION)"

docker-build-prod: ## Build production Docker image with optimizations
	docker build -t java-auth:$(VERSION) --target=production .
	docker tag java-auth:$(VERSION) java-auth:latest
	@echo "Built production image: java-auth:$(VERSION)"

docker-run: ## Run application container only (requires external MySQL)
	docker run -p 8080:8080 --env-file .env java-auth:$(VERSION)

docker-clean: ## Remove application Docker images
	docker rmi java-auth:latest || true
	docker image prune -f

docker-multi: ## Build and push multi-arch Docker images
	@echo "Building and pushing multi-arch Docker image for server"
	@docker buildx build --push --platform linux/amd64,linux/arm64 --tag ${REGISTRY} .
	@echo "Building and pushing multi-arch Docker image for client"
	@docker buildx build --push --platform linux/amd64,linux/arm64 --tag ${CLIENT_REGISTRY} ./client

# Database Commands
db-migrate: ## Run database migrations
	cd server && $(MVN) flyway:migrate

db-info: ## Show migration status
	cd server && $(MVN) flyway:info

db-reset: ## Reset database (WARNING: destroys data)
	docker-compose exec mysql mysql -uroot -ppassword -e "DROP DATABASE IF EXISTS authdb; CREATE DATABASE authdb;"
	$(MAKE) db-migrate

# Code Quality Commands
lint: ## Check code formatting
	cd server && $(MVN) spotless:check

format: ## Format code
	cd server && $(MVN) spotless:apply

deps: ## Download dependencies
	cd server && $(MVN) dependency:resolve

deps-check: ## Check for dependency updates
	cd server && $(MVN) versions:display-dependency-updates

# API Commands
api-docs: ## Open API documentation in browser
	@echo "Starting application and opening Swagger UI..."
	@echo "Navigate to: http://localhost:8080/swagger-ui/index.html"

test-api: ## Test API endpoints (requires running application)
	@echo "Testing authentication endpoints..."
	curl -X POST http://localhost:8080/api/auth/login \
		-H "Content-Type: application/json" \
		-d '{"username":"demo","password":"password"}' | jq .
	@echo "\nAPI documentation: http://localhost:8080/swagger-ui/index.html"

# Client Commands
client: ## Run auth client
	@echo "Running auth client"
	@./client/client

client-docker-build: ## Build client Docker image
	@echo "Building client Docker image"
	docker build -t java-auth-client:latest ./client

client-docker-run: ## Run client in Docker
	@echo "Running client in Docker"
	docker run --rm -e SERVER_URL=host.docker.internal:8080 java-auth-client:latest

client-capture: export SERVER_URL=localhost:4143
client-capture: client

# Health and Status Commands
health: ## Check application health
	curl -s http://localhost:8080/actuator/health | jq .

status: ## Show service status
	@echo "=== Docker Containers ==="
	docker-compose ps
	@echo "\n=== Application Health ==="
	$(MAKE) health || echo "Application not responding"

# Setup Commands
setup: ## Initial project setup
	@echo "Setting up development environment..."
	@if [ -f ./mvnw ]; then chmod +x mvnw; else echo "Using system Maven"; fi
	$(MAKE) deps
	$(MAKE) up
	@echo "Waiting for MySQL to be ready..."
	sleep 10
	$(MAKE) db-migrate
	@echo "Setup complete! Run 'make status' to verify."

# Utility Commands
# Note: version and tag commands are now centralized in the root Makefile

env-example: ## Create .env example file
	@echo "Creating .env.example..."
	@echo "# Database Configuration" > .env.example
	@echo "DB_HOST=localhost" >> .env.example
	@echo "DB_PORT=3306" >> .env.example
	@echo "DB_NAME=authdb" >> .env.example
	@echo "DB_USERNAME=authuser" >> .env.example
	@echo "DB_PASSWORD=authpass" >> .env.example
	@echo "" >> .env.example
	@echo "# JWT Configuration" >> .env.example
	@echo "JWT_SECRET=your-secret-key-change-this-in-production" >> .env.example
	@echo "JWT_EXPIRATION=86400" >> .env.example
	@echo "" >> .env.example
	@echo "# Application Configuration" >> .env.example
	@echo "SERVER_PORT=8080" >> .env.example
	@echo "SPRING_PROFILES_ACTIVE=dev" >> .env.example
	@echo ".env.example created. Copy to .env and configure for your environment."

# Kubernetes Commands

k8s-deploy: ## Deploy to Kubernetes
	@echo "Deploying Java Auth microservice to Kubernetes..."
	kubectl apply -k k8s/base
	@echo "Deployment complete!"
	@echo "Run 'make k8s-status' to check deployment status"

k8s-deploy-simple: ## Deploy to Kubernetes (simplified)
	kubectl apply -k k8s/base

k8s-undeploy: ## Remove from Kubernetes
	@echo "Removing Java Auth microservice from Kubernetes..."
	kubectl delete -k k8s/base --ignore-not-found=true
	@echo "Undeployment complete!"

k8s-status: ## Check Kubernetes deployment status
	@echo "=== Pods ==="
	kubectl get pods -l app.kubernetes.io/name=java-auth
	@echo "\n=== Services ==="
	kubectl get services -l app.kubernetes.io/name=java-auth
	@echo "\n=== PersistentVolumeClaims ==="
	kubectl get pvc -l app.kubernetes.io/name=java-auth

k8s-logs: ## Show application logs from Kubernetes
	kubectl logs -l app=java-auth -f

k8s-logs-mysql: ## Show MySQL logs from Kubernetes
	kubectl logs -l app=mysql -f

k8s-port-forward: ## Port forward to access the service locally
	@echo "Port forwarding java-auth service to localhost:8080..."
	kubectl port-forward service/java-auth-service 8080:80

k8s-mysql-port-forward: ## Port forward MySQL for local access
	@echo "Port forwarding MySQL service to localhost:3307..."
	kubectl port-forward service/mysql-service 3307:3306

k8s-exec: ## Execute into the application pod
	$(eval POD := $(shell kubectl get pods -l app=java-auth -o jsonpath='{.items[0].metadata.name}'))
	kubectl exec -it $(POD) -- /bin/bash

k8s-mysql-exec: ## Execute into the MySQL pod
	$(eval POD := $(shell kubectl get pods -l app=mysql -o jsonpath='{.items[0].metadata.name}'))
	kubectl exec -it $(POD) -- mysql -u root -p

k8s-describe: ## Describe application deployment
	kubectl describe deployment java-auth

k8s-events: ## Show recent events
	kubectl get events --field-selector involvedObject.name=java-auth --sort-by=.metadata.creationTimestamp

# CI/CD helpers (future use)
ci-build: ## CI build command
	@echo "This will be implemented in Phase 14"

ci-test: ## CI test command
	@echo "This will be implemented in Phase 14"