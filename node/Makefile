VERSION?=1.0.4
REGISTRY?=gcr.io/speedscale-demos/node-server:${VERSION}
NAMESPACE?=default

.PHONY: docker-multi
docker-multi:
	@echo "Building and pushing multi-arch Docker image"
	@docker buildx build --push --platform linux/amd64,linux/arm64 --tag ${REGISTRY} .
