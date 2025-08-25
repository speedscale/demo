# Root Makefile for Speedscale Demo
# Centralizes version management across all projects

# Get version from VERSION file
VERSION := $(shell cat VERSION 2>/dev/null || echo "1.0.0")

.PHONY: version set-version update-version validate-version bump-version release help

help: ## Show this help message
	@echo "Speedscale Demo - Centralized Version Management"
	@echo ""
	@echo "Current version: $(VERSION)"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

version: ## Show current version
	@echo $(VERSION)

set-version: ## Set new version (usage: make set-version VERSION=1.0.7)
	@if [ -z "$(VERSION)" ]; then \
		echo "Usage: make set-version VERSION=1.0.7"; \
		exit 1; \
	fi
	@echo "$(VERSION)" > VERSION
	@echo "Version updated to $(VERSION)"
	@echo "Remember to commit the VERSION file and create a git tag"

update-version: ## Update VERSION file and all manifests/configs (usage: make update-version VERSION=1.0.8)
	@if [ -z "$(VERSION)" ]; then \
		echo "Usage: make update-version VERSION=1.0.8"; \
		exit 1; \
	fi
	@echo "Updating to version $(VERSION)..."
	@echo "$(VERSION)" > VERSION
	@echo "Updating Kubernetes manifests..."
	@sed -i '' 's|gcr.io/speedscale-demos/java-auth:[v]*[0-9.]*|gcr.io/speedscale-demos/java-auth:$(VERSION)|g' java-auth/k8s/base/auth-deployment.yaml
	@sed -i '' 's|gcr.io/speedscale-demos/java-auth-client:[v]*[0-9.]*|gcr.io/speedscale-demos/java-auth-client:$(VERSION)|g' java-auth/k8s/base/auth-client-deployment.yaml
	@sed -i '' 's|gcr.io/speedscale-demos/java-server:[v]*[0-9.]*|gcr.io/speedscale-demos/java-server:v$(VERSION)|g' java/manifest.yaml
	@sed -i '' 's|gcr.io/speedscale-demos/node-server:[v]*[0-9.]*|gcr.io/speedscale-demos/node-server:v$(VERSION)|g' node/manifest.yaml
	@echo "Updating Maven pom.xml files..."
	@sed -i '' '/<artifactId>auth<\/artifactId>/,+1 s|<version>[^<]*</version>|<version>$(VERSION)</version>|' java-auth/server/pom.xml
	@sed -i '' '/<artifactId>server<\/artifactId>/,+1 s|<version>[^<]*</version>|<version>$(VERSION)</version>|' java/server/pom.xml
	@sed -i '' '/<artifactId>jwt-generator<\/artifactId>/,+1 s|<version>[^<]*</version>|<version>$(VERSION)</version>|' java-auth/scripts/pom.xml
	@echo "Updating Node package.json..."
	@sed -i '' 's|"version": "[0-9.]*"|"version": "$(VERSION)"|' node/package.json
	@echo "Updating documentation..."
	@sed -i '' 's|gcr.io/speedscale-demos/java-auth[^:]*:[v]*[0-9.]*|gcr.io/speedscale-demos/java-auth:$(VERSION)|g' java-auth/IMPLEMENTATION_TASKS.md
	@sed -i '' 's|gcr.io/speedscale-demos/java-auth-client[^:]*:[v]*[0-9.]*|gcr.io/speedscale-demos/java-auth-client:$(VERSION)|g' java-auth/IMPLEMENTATION_TASKS.md
	@echo ""
	@echo "✅ Version $(VERSION) updated across all files!"
	@echo ""
	@$(MAKE) validate-version

validate-version: ## Validate that all versions are consistent with VERSION file
	@echo "🔍 Validating version consistency..."
	@VERSION_FILE=$$(cat VERSION); \
	echo "Expected version: $$VERSION_FILE"; \
	echo ""; \
	echo "Checking Kubernetes manifests:"; \
	grep -n "image:.*gcr.io/speedscale-demos/.*:[v]*[0-9.]" java-auth/k8s/base/auth-deployment.yaml java-auth/k8s/base/auth-client-deployment.yaml java/manifest.yaml node/manifest.yaml | \
	while read line; do \
		if echo "$$line" | grep -q ":$$VERSION_FILE" || echo "$$line" | grep -q ":v$$VERSION_FILE"; then \
			echo "  ✅ $$line"; \
		else \
			echo "  ❌ $$line (expected $$VERSION_FILE or v$$VERSION_FILE)"; \
		fi; \
	done; \
	echo ""; \
	echo "Checking Maven pom.xml files:"; \
	VERSION_IN_AUTH=$$(grep -A1 '<artifactId>auth</artifactId>' java-auth/server/pom.xml | grep '<version>' | sed 's/.*<version>//g' | sed 's/<\/version>.*//g' | xargs); \
	if [ "$$VERSION_IN_AUTH" = "$$VERSION_FILE" ]; then \
		echo "  ✅ java-auth/server/pom.xml: $$VERSION_IN_AUTH"; \
	else \
		echo "  ❌ java-auth/server/pom.xml: $$VERSION_IN_AUTH (expected $$VERSION_FILE)"; \
	fi; \
	VERSION_IN_SERVER=$$(grep -A1 '<artifactId>server</artifactId>' java/server/pom.xml | grep '<version>' | sed 's/.*<version>//g' | sed 's/<\/version>.*//g' | xargs); \
	if [ "$$VERSION_IN_SERVER" = "$$VERSION_FILE" ]; then \
		echo "  ✅ java/server/pom.xml: $$VERSION_IN_SERVER"; \
	else \
		echo "  ❌ java/server/pom.xml: $$VERSION_IN_SERVER (expected $$VERSION_FILE)"; \
	fi; \
	VERSION_IN_SCRIPTS=$$(grep -A1 '<artifactId>jwt-generator</artifactId>' java-auth/scripts/pom.xml | grep '<version>' | sed 's/.*<version>//g' | sed 's/<\/version>.*//g' | xargs); \
	if [ "$$VERSION_IN_SCRIPTS" = "$$VERSION_FILE" ]; then \
		echo "  ✅ java-auth/scripts/pom.xml: $$VERSION_IN_SCRIPTS"; \
	else \
		echo "  ❌ java-auth/scripts/pom.xml: $$VERSION_IN_SCRIPTS (expected $$VERSION_FILE)"; \
	fi; \
	echo ""; \
	echo "Checking Node package.json:"; \
	VERSION_IN_PKG=$$(grep -o '"version": "[0-9.]*"' node/package.json | sed 's/"version": "//g' | sed 's/"//g'); \
	if [ "$$VERSION_IN_PKG" = "$$VERSION_FILE" ]; then \
		echo "  ✅ node/package.json: $$VERSION_IN_PKG"; \
	else \
		echo "  ❌ node/package.json: $$VERSION_IN_PKG (expected $$VERSION_FILE)"; \
	fi

bump-version: ## Bump to next patch version and update all files
	@CURRENT_VERSION=$$(cat VERSION); \
	MAJOR=$$(echo $$CURRENT_VERSION | cut -d. -f1); \
	MINOR=$$(echo $$CURRENT_VERSION | cut -d. -f2); \
	PATCH=$$(echo $$CURRENT_VERSION | cut -d. -f3); \
	NEW_PATCH=$$((PATCH + 1)); \
	NEW_VERSION="$$MAJOR.$$MINOR.$$NEW_PATCH"; \
	echo "Bumping version from $$CURRENT_VERSION to $$NEW_VERSION"; \
	$(MAKE) update-version VERSION=$$NEW_VERSION

# Project-specific build targets
build-java: ## Build Java project
	cd java && make build

build-java-auth: ## Build Java Auth project  
	cd java-auth && make build

build-node: ## Build Node project
	cd node && make build

build-all: build-java build-java-auth build-node ## Build all projects

# Docker build targets with centralized version
docker-java: ## Build and push Java Docker image
	cd java && make docker-multi VERSION=$(VERSION)

docker-java-auth: ## Build and push Java Auth Docker images
	cd java-auth && make docker-multi VERSION=$(VERSION)

docker-node: ## Build and push Node Docker image
	cd node && make docker-multi VERSION=$(VERSION)

docker-all: docker-java docker-java-auth docker-node ## Build and push all Docker images

# Test targets
test-java: ## Test Java project
	cd java && make test

test-java-auth: ## Test Java Auth project
	cd java-auth && make test

test-all: test-java test-java-auth ## Run all tests

# Release management
release: ## Create a new release (usage: make release VERSION=1.0.7)
	@if [ -z "$(VERSION)" ]; then \
		echo "Usage: make release VERSION=1.0.7"; \
		exit 1; \
	fi
	@echo "$(VERSION)" > VERSION
	@git add VERSION
	@git commit -m "Bump version to $(VERSION)"
	@git tag -a "v$(VERSION)" -m "Release version $(VERSION)"
	@echo "Release $(VERSION) created. Push with: git push origin master && git push origin v$(VERSION)"