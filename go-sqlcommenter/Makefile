.PHONY: build
build:
	@echo "Building go-sqlcommenter"
	@go build -o go-sqlcommenter-demo .

.PHONY: test
test:
	@echo "Testing go-sqlcommenter"
	@go vet ./...
	@go test ./...

.PHONY: db
db:
	@docker compose up -d --wait postgres

.PHONY: local
local:
	@echo "Running go-sqlcommenter locally"
	@go run .

.PHONY: load
load:
	@./load.sh

.PHONY: compose
compose:
	@docker compose up --build

.PHONY: compose-down
compose-down:
	@docker compose down -v
