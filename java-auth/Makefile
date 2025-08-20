# Java Authentication Microservice Makefile
# Provides common development tasks and workflows

.PHONY: help build test clean run dev up down logs lint format deps docker-build docker-run docker-clean

# Maven wrapper detection
MVN := $(shell if [ -f ./mvnw ]; then echo "./mvnw"; else echo "mvn"; fi)

# Default target
help: ## Show this help message
	@echo "Java Authentication Microservice - Available Commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

# Development Commands
build: ## Build the application JAR
	$(MVN) clean package -DskipTests

test: ## Run all tests
	$(MVN) test

test-coverage: ## Run tests with coverage report
	$(MVN) clean test jacoco:report

clean: ## Clean build artifacts
	$(MVN) clean

run: ## Run the application locally (requires MySQL)
	$(MVN) spring-boot:run

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
	$(eval VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo "latest"))
	docker build -t java-auth:$(VERSION) .
	docker tag java-auth:$(VERSION) java-auth:latest
	@echo "Built image: java-auth:$(VERSION)"

docker-build-prod: ## Build production Docker image with optimizations
	$(eval VERSION := $(shell git describe --tags --always 2>/dev/null || echo "latest"))
	docker build -t java-auth:$(VERSION) --target=production .
	docker tag java-auth:$(VERSION) java-auth:latest
	@echo "Built production image: java-auth:$(VERSION)"

docker-run: ## Run application container only (requires external MySQL)
	$(eval VERSION := $(shell git describe --tags --always --dirty 2>/dev/null || echo "latest"))
	docker run -p 8080:8080 --env-file .env java-auth:$(VERSION)

docker-clean: ## Remove application Docker images
	docker rmi java-auth:latest || true
	docker image prune -f

# Database Commands
db-migrate: ## Run database migrations
	$(MVN) flyway:migrate

db-info: ## Show migration status
	$(MVN) flyway:info

db-reset: ## Reset database (WARNING: destroys data)
	docker-compose exec mysql mysql -uroot -ppassword -e "DROP DATABASE IF EXISTS authdb; CREATE DATABASE authdb;"
	$(MAKE) db-migrate

# Code Quality Commands
lint: ## Check code formatting
	$(MVN) spotless:check

format: ## Format code
	$(MVN) spotless:apply

deps: ## Download dependencies
	$(MVN) dependency:resolve

deps-check: ## Check for dependency updates
	$(MVN) versions:display-dependency-updates

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
version: ## Show current version
	@git describe --tags --always --dirty 2>/dev/null || echo "No version info available"

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
k8s-namespace: ## Create Kubernetes namespace
	kubectl apply -f k8s/base/namespace.yaml

k8s-deploy: ## Deploy to Kubernetes
	@echo "Deploying Java Auth microservice to Kubernetes..."
	kubectl apply -f k8s/base/namespace.yaml
	kubectl apply -f k8s/base/mysql-secret.yaml
	kubectl apply -f k8s/base/mysql-configmap.yaml
	kubectl apply -f k8s/base/mysql-pv.yaml
	kubectl apply -f k8s/base/mysql-pvc.yaml
	kubectl apply -f k8s/base/mysql-deployment.yaml
	kubectl apply -f k8s/base/mysql-service.yaml
	@echo "Waiting for MySQL to be ready..."
	kubectl wait --for=condition=ready pod -l app=mysql -n java-auth --timeout=120s
	kubectl apply -f k8s/base/auth-configmap.yaml
	kubectl apply -f k8s/base/auth-deployment.yaml
	kubectl apply -f k8s/base/auth-service.yaml
	kubectl apply -f k8s/base/ingress.yaml
	@echo "Deployment complete!"
	@echo "Run 'make k8s-status' to check deployment status"

k8s-deploy-dev: ## Deploy to Kubernetes (dev environment)
	kubectl apply -k k8s/overlays/dev

k8s-deploy-staging: ## Deploy to Kubernetes (staging environment)
	kubectl apply -k k8s/overlays/staging

k8s-deploy-prod: ## Deploy to Kubernetes (production environment)
	kubectl apply -k k8s/overlays/prod

k8s-undeploy: ## Remove from Kubernetes
	@echo "Removing Java Auth microservice from Kubernetes..."
	kubectl delete -f k8s/base/ingress.yaml --ignore-not-found=true
	kubectl delete -f k8s/base/auth-service.yaml --ignore-not-found=true
	kubectl delete -f k8s/base/auth-deployment.yaml --ignore-not-found=true
	kubectl delete -f k8s/base/auth-configmap.yaml --ignore-not-found=true
	kubectl delete -f k8s/base/mysql-service.yaml --ignore-not-found=true
	kubectl delete -f k8s/base/mysql-deployment.yaml --ignore-not-found=true
	kubectl delete -f k8s/base/mysql-pvc.yaml --ignore-not-found=true
	kubectl delete -f k8s/base/mysql-pv.yaml --ignore-not-found=true
	kubectl delete -f k8s/base/mysql-configmap.yaml --ignore-not-found=true
	kubectl delete -f k8s/base/mysql-secret.yaml --ignore-not-found=true
	kubectl delete -f k8s/base/namespace.yaml --ignore-not-found=true
	@echo "Undeployment complete!"

k8s-status: ## Check Kubernetes deployment status
	@echo "=== Namespace ==="
	kubectl get namespace java-auth
	@echo "\n=== Pods ==="
	kubectl get pods -n java-auth
	@echo "\n=== Services ==="
	kubectl get services -n java-auth
	@echo "\n=== Ingress ==="
	kubectl get ingress -n java-auth
	@echo "\n=== PersistentVolumeClaims ==="
	kubectl get pvc -n java-auth

k8s-logs: ## Show application logs from Kubernetes
	kubectl logs -l app=java-auth -n java-auth -f

k8s-logs-mysql: ## Show MySQL logs from Kubernetes
	kubectl logs -l app=mysql -n java-auth -f

k8s-port-forward: ## Port forward to access the service locally
	@echo "Port forwarding java-auth service to localhost:8080..."
	kubectl port-forward -n java-auth service/java-auth-service 8080:80

k8s-mysql-port-forward: ## Port forward MySQL for local access
	@echo "Port forwarding MySQL service to localhost:3307..."
	kubectl port-forward -n java-auth service/mysql-service 3307:3306

k8s-exec: ## Execute into the application pod
	$(eval POD := $(shell kubectl get pods -n java-auth -l app=java-auth -o jsonpath='{.items[0].metadata.name}'))
	kubectl exec -it -n java-auth $(POD) -- /bin/bash

k8s-mysql-exec: ## Execute into the MySQL pod
	$(eval POD := $(shell kubectl get pods -n java-auth -l app=mysql -o jsonpath='{.items[0].metadata.name}'))
	kubectl exec -it -n java-auth $(POD) -- mysql -u root -p

k8s-describe: ## Describe application deployment
	kubectl describe deployment java-auth -n java-auth

k8s-events: ## Show recent events in the namespace
	kubectl get events -n java-auth --sort-by=.metadata.creationTimestamp

# CI/CD helpers (future use)
ci-build: ## CI build command
	@echo "This will be implemented in Phase 14"

ci-test: ## CI test command
	@echo "This will be implemented in Phase 14"