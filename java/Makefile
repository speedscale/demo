VERSION?=1.0.0
REGISTRY?=gcr.io/speedscale-demos/java-server:${VERSION}
NAMESPACE?=default

.PHONY: local
local:
	@echo "Running java locally"
	@cd server && ./mvnw spring-boot:run

.PHONY: docker
compose:
	@echo "Running app in docker compose"
	@docker compose up --build

.PHONY: docker-multi
docker-multi:
	@echo "Building and pushing multi-arch Docker image"
	@docker buildx build --push --platform linux/amd64,linux/arm64 --tag ${REGISTRY} .

.PHONY: kube
kube:
	@echo "Deploying app to namespace: ${NAMESPACE} in Kubernetes"
	@kubectl -n ${NAMESPACE} apply -f kubernetes.yaml

.PHONY: kube-clean
kube-clean:
	@echo "Deleting app from kubernetes"
	@kubectl -n ${NAMESPACE} delete -f kubernetes.yaml
