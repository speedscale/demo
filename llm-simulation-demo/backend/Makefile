VERSION ?= $(shell cat ../../VERSION 2>/dev/null || echo "1.0.0")
IMAGE    = gcr.io/speedscale-demos/llm-simulation-backend

.PHONY: test docker-multi

test:
	pip install -q -r requirements-dev.txt
	pytest

docker-multi:
	docker buildx build \
		--platform linux/amd64,linux/arm64 \
		-t $(IMAGE):v$(VERSION) \
		--push .
