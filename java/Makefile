VERSION?=1.0.0
REGISTRY?=gcr.io/speedscale-demos/java-server:${VERSION}
NAMESPACE?=default

.PHONY: local
local:
	@echo "Running java locally"
	@cd server && ./mvnw spring-boot:run ${SPRING_BOOT_RUN_OPTS}

.PHONY: local-with-speedscale
local-with-speedscale: export SPRING_BOOT_RUN_OPTS=-Dspring-boot.run.jvmArguments="-Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=4140 -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=4140 -Djavax.net.ssl.trustStore=${SPEEDCTL_HOME}/certs/cacerts.jks -Djavax.net.ssl.trustStorePassword=changeit"
local-with-speedscale: local

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
	@kubectl -n ${NAMESPACE} apply -k ./

.PHONY: kube-clean
kube-clean:
	@echo "Deleting app from kubernetes"
	@kubectl -n ${NAMESPACE} delete -k ./

.PHONY: client
client:
	@echo "Running client"
	@./client/client

.PHONY: local-client-capture
local-client-capture: export SERVER_URL=localhost:4143
local-client-capture: client
