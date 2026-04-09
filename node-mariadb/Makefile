VERSION?=$(shell cat ../VERSION 2>/dev/null || echo "1.0.0")
REGISTRY?=gcr.io/speedscale-demos/node-mariadb:v${VERSION}
NAMESPACE?=default

.PHONY: help
help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  %-20s %s\n", $$1, $$2}'

.PHONY: certs
certs: ## Generate TLS certificates for MariaDB
	@./gen-certs.sh

.PHONY: build
build: ## Install Node dependencies
	@echo "Installing dependencies..."
	@npm install

.PHONY: infra
infra: certs ## Start infrastructure (MariaDB + KrakenD) in Docker
	@docker compose up -d
	@echo ""
	@echo "Infrastructure starting..."
	@echo "  MariaDB:   localhost:3306 (TLS required)"
	@echo "  KrakenD:   http://localhost:8080 -> host:3001"
	@echo ""
	@printf "Waiting for MariaDB to be healthy..."
	@until docker compose exec -T mariadb healthcheck.sh --connect --innodb_initialized >/dev/null 2>&1; do \
		printf "."; \
		sleep 2; \
	done
	@echo " ready."

.PHONY: local
local: build ## Run the Node.js API on the host (port 3001)
	DB_HOST=127.0.0.1 DB_SSL_CA=./certs/ca.pem PORT=3001 node server.js

.PHONY: capture
capture: ## Start speedctl capture, then run the Node app through it
	@echo "Starting speedctl capture for node-mariadb on port 3001..."
	@echo ""
	@echo "Step 1: speedctl capture is starting (inbound proxy on :4143)"
	@echo "Step 2: Open a new terminal and run:"
	@echo ""
	@echo "  export http_proxy='http://127.0.0.1:4140'"
	@echo "  export https_proxy='http://127.0.0.1:4140'"
	@echo "  export NODE_EXTRA_CA_CERTS=\$${HOME}/.speedscale/certs/tls.crt"
	@echo "  DB_HOST=127.0.0.1 DB_SSL_CA=./certs/ca.pem PORT=3001 node server.js"
	@echo ""
	@echo "Step 3: Send traffic to KrakenD on :8080 (or directly to :4143)"
	@echo ""
	speedctl capture node-mariadb 3001

.PHONY: client
client: ## Send sample traffic through KrakenD
	@echo "==> Health check"
	@curl -sf http://localhost:8080/health | python3 -m json.tool
	@echo "\n==> List products"
	@curl -sf http://localhost:8080/products | python3 -m json.tool
	@echo "\n==> Create product"
	@created=$$(curl -sf -X POST http://localhost:8080/products \
	  -H 'Content-Type: application/json' \
	  -d '{"name":"Test Item","price":4.99,"quantity":10}'); \
	printf "%s" "$$created" | python3 -m json.tool; \
	id=$$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['id'])" "$$created"); \
	echo "\n==> Get product $$id"; \
	curl -sf http://localhost:8080/products/$$id | python3 -m json.tool; \
	echo "\n==> Update product $$id"; \
	curl -sf -X PUT http://localhost:8080/products/$$id -H 'Content-Type: application/json' -d '{"price":7.99}' | python3 -m json.tool; \
	echo "\n==> Delete product $$id"; \
	curl -sf -X DELETE http://localhost:8080/products/$$id | python3 -m json.tool
	@echo "\nDone."

.PHONY: client-capture
client-capture: ## Send sample traffic through speedctl capture proxy (:4143)
	@echo "==> Sending traffic to speedctl inbound proxy on :4143"
	@echo "==> Health check"
	@curl -sf http://localhost:4143/health | python3 -m json.tool
	@echo "\n==> List products"
	@curl -sf http://localhost:4143/products | python3 -m json.tool
	@echo "\n==> Create product"
	@created=$$(curl -sf -X POST http://localhost:4143/products \
	  -H 'Content-Type: application/json' \
	  -d '{"name":"Captured Item","price":12.99,"quantity":3}'); \
	printf "%s" "$$created" | python3 -m json.tool; \
	id=$$(python3 -c "import json,sys; print(json.loads(sys.argv[1])['id'])" "$$created"); \
	echo "\n==> Get product $$id"; \
	curl -sf http://localhost:4143/products/$$id | python3 -m json.tool
	@echo "\nDone. Check Speedscale traffic viewer for captured data."

.PHONY: test-all
test-all: build ## Run full automated lifecycle: record -> replay -> mock
	@./test-all.sh all

.PHONY: test-record
test-record: build ## Phase 1 only: record traffic with proxymock
	@./test-all.sh record

.PHONY: test-replay
test-replay: ## Phase 2 only: replay without mocks (uses latest recording)
	@./test-all.sh replay

.PHONY: test-mock
test-mock: ## Phase 3 only: replay with mocks (uses latest recording)
	@./test-all.sh mock

.PHONY: inspect
inspect: ## Open proxymock TUI to inspect recorded traffic
	@dir=$$(ls -dt proxymock/recorded-* 2>/dev/null | head -1); \
	if [ -z "$$dir" ]; then echo "No recordings found. Run 'make test-record' first."; exit 1; fi; \
	echo "Inspecting: $$dir"; \
	proxymock inspect --in "$$dir"

.PHONY: down
down: ## Stop infrastructure containers
	@docker compose down

.PHONY: clean
clean: down ## Stop containers and remove volumes + certs + node_modules + recordings
	@docker compose down -v
	@rm -rf certs/ node_modules/ proxymock/

.PHONY: logs
logs: ## Tail logs for infrastructure services
	@docker compose logs -f

.PHONY: docker-multi
docker-multi: ## Build and push multi-arch Docker image
	@echo "Building and pushing multi-arch Docker image"
	@docker buildx build --push --platform linux/amd64,linux/arm64 --tag ${REGISTRY} .
