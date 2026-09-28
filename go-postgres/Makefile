.PHONY: build
build:
	@echo "Building go-postgres"
	@go build -o go-postgres-demo .

.PHONY: test
test:
	@echo "Testing go-postgres"
	@go vet ./...
	@go test ./...

.PHONY: local
local:
	@echo "Running go-postgres locally"
	@go run .

.PHONY: local-showcase
local-showcase:
	@echo "Running go-postgres locally with the /showcase endpoints"
	@SHOWCASE=1 go run .

.PHONY: traffic
traffic:
	@./traffic.sh

.PHONY: traffic-showcase
traffic-showcase:
	@SHOWCASE=1 ./traffic.sh
