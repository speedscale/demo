VERSION?=$(shell cat ../VERSION 2>/dev/null || echo "1.1.7")
IMAGE?=gcr.io/speedscale-demos/go-mysql
REGISTRY?=${IMAGE}:v${VERSION}
LATEST?=${IMAGE}:latest

.PHONY: build
build:
	@echo "Building go-mysql"
	@go build -o go-mysql-demo .

.PHONY: test
test:
	@echo "Testing go-mysql"
	@go vet ./...
	@go test ./...

.PHONY: local
local:
	@echo "Running go-mysql locally"
	@go run .

.PHONY: compose
compose:
	@docker compose up --build

.PHONY: compose-down
compose-down:
	@docker compose down -v

.PHONY: docker-multi
docker-multi:
	@echo "Building and pushing multi-arch Docker image"
	@docker buildx build --push --platform linux/amd64,linux/arm64 --tag ${REGISTRY} --tag ${LATEST} .
