IMAGE ?= trace-demo:local

.PHONY: help test build image deploy minikube undeploy run-local

help:
	@echo "trace-demo targets:"
	@echo "  make test      - go vet + unit tests for the app"
	@echo "  make build     - compile the app binary"
	@echo "  make image     - docker build $(IMAGE)"
	@echo "  make minikube  - build into minikube's docker + deploy the stack"
	@echo "  make deploy    - kubectl apply -k k8s (image must already exist)"
	@echo "  make undeploy  - delete the trace-demo namespace"

test:
	cd app && go vet ./... && go test ./...

build:
	cd app && CGO_ENABLED=0 go build -o ../bin/trace-demo .

image:
	docker build -t $(IMAGE) .

minikube:
	./k8s/deploy-minikube.sh

deploy:
	kubectl apply -k k8s

undeploy:
	kubectl delete namespace trace-demo --ignore-not-found
