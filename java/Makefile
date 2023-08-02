VERSION?=1.0.1
REGISTRY?=gcr.io/speedscale-demos/java-server:${VERSION}
NAMESPACE?=default

.PHONY: local
local:
	@echo "Running java locally"
	@cd server && ./mvnw spring-boot:run ${SPRING_BOOT_RUN_OPTS}

.PHONY: local-capture
local-capture: export SPRING_BOOT_RUN_OPTS=-Dspring-boot.run.jvmArguments="-Dhttp.proxyHost=127.0.0.1 -Dhttp.proxyPort=4140 -Dhttps.proxyHost=127.0.0.1 -Dhttps.proxyPort=4140 -Djavax.net.ssl.trustStore=${SPEEDCTL_HOME}/certs/cacerts.jks -Djavax.net.ssl.trustStorePassword=changeit"
local-capture: local

.PHONY: local-replay
local-replay: local-capture

.PHONY: compose
compose:
	@echo "Running app in docker compose"
	@docker compose up --build

.PHONY: compose-capture
compose-capture: export JAVA_OPTS=-Dhttp.proxyHost=host.docker.internal -Dhttp.proxyPort=4140 -Dhttps.proxyHost=host.docker.internal -Dhttps.proxyPort=4140 -Djavax.net.ssl.trustStore=/etc/ssl/speedscale/cacerts.jks -Djavax.net.ssl.trustStorePassword=changeit
compose-capture: compose

.PHONY: compose-replay
compose-replay: compose-capture

.PHONY: kube
kube:
	@echo "Deploying app to namespace: ${NAMESPACE} in Kubernetes"
	@kubectl -n ${NAMESPACE} apply -k ./

.PHONY: kube-clean
kube-clean:
	@echo "Deleting app from kubernetes"
	@kubectl -n ${NAMESPACE} delete -k ./

.PHONY: kube-capture
kube-capture: kube
	@kubectl -n ${NAMESPACE} patch deployment/java-server --patch-file patch.yaml

.PHONY: client
client:
	@echo "Running client"
	@./client/client

.PHONY: client-capture
client-capture: export SERVER_URL=localhost:4143
client-capture: client


.PHONY: docker-multi
docker-multi:
	@echo "Building and pushing multi-arch Docker image"
	@docker buildx build --push --platform linux/amd64,linux/arm64 --tag ${REGISTRY} .
