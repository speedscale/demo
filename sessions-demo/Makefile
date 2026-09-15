VERSION?=$(shell cat ../VERSION 2>/dev/null || echo "1.0.0")
REGISTRY?=gcr.io/speedscale-demos/sessions-demo:v${VERSION}
PORT?=3000
BASE?=http://localhost:4143

.PHONY: build
build:
	@echo "sessions-demo has no dependencies; nothing to build"

.PHONY: test bank-drive bank-dependency bank-proxymock
test:
	@node --test banking.test.js

bank-drive:
	@BASE=$(BASE) node client/banking.js

bank-dependency:
	@PORT=3001 node statement-data.js

bank-proxymock:
	@node test-banking-proxymock.js

.PHONY: start
start:
	@PORT=$(PORT) node server.js

.PHONY: drive
drive:
	@BASE=$(BASE) node client/drive.js

.PHONY: record
record:
	@echo "Recording sessions-demo with proxymock (proxy on :4143, app on :$(PORT))"
	@PORT=$(PORT) proxymock record --app-port $(PORT) -- npm start

.PHONY: docker-multi
docker-multi:
	@echo "Building and pushing multi-arch Docker image"
	@docker buildx build --push --platform linux/amd64,linux/arm64 --tag ${REGISTRY} .

.PHONY: bank-load-groups
bank-load-groups:
	node test-banking-load-groups.js

.PHONY: bank-load-composition
bank-load-composition:
	BANK_LOAD_CASES=composition node test-banking-load-groups.js

.PHONY: bank-load-multiples
bank-load-multiples:
	BANK_LOAD_CASES=multiples node test-banking-load-groups.js

.PHONY: bank-load-goals
bank-load-goals:
	BANK_LOAD_CASES=goals node test-banking-load-groups.js

.PHONY: bank-load-identity
bank-load-identity:
	BANK_LOAD_CASES=identity node test-banking-load-groups.js

.PHONY: bank-load-synthesis
bank-load-synthesis:
	BANK_LOAD_CASES=synthesis node test-banking-load-groups.js

.PHONY: bank-load-clones
bank-load-clones:
	BANK_LOAD_CASES=clones node test-banking-load-groups.js

.PHONY: bank-load-workers
bank-load-workers:
	BANK_LOAD_CASES=workers node test-banking-load-groups.js

.PHONY: bank-load-tps
bank-load-tps:
	BANK_LOAD_CASES=tps node test-banking-load-groups.js
