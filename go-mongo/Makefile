VERSION?=$(shell cat ../VERSION 2>/dev/null || echo "1.1.7")
IMAGE?=gcr.io/speedscale-demos/go-mongo
REGISTRY?=${IMAGE}:v${VERSION}
LATEST?=${IMAGE}:latest

.PHONY: build
build:
	@echo "Building go-mongo"
	@go build -o mongo-demo .

.PHONY: test
test:
	@echo "Testing go-mongo"
	@go test ./...

.PHONY: local
local:
	@echo "Running go-mongo locally"
	@go run main.go

.PHONY: docker-multi
docker-multi:
	@echo "Building and pushing multi-arch Docker image"
	@docker buildx build --push --platform linux/amd64,linux/arm64 --tag ${REGISTRY} --tag ${LATEST} .
