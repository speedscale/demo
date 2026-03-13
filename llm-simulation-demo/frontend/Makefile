VERSION ?= $(shell cat ../../VERSION 2>/dev/null || echo "1.0.0")
IMAGE    = gcr.io/speedscale-demos/llm-simulation-frontend

.PHONY: test build docker-multi

test:
	npm install --silent
	npm test -- --passWithNoTests

build:
	npm install --silent
	npm run build

docker-multi:
	docker buildx build \
		--platform linux/amd64,linux/arm64 \
		-t $(IMAGE):v$(VERSION) \
		--push .
