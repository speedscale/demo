# graphql-demo, Java edition: the same targets as ../Makefile. See ../README.md.

.PHONY: help build run record exercise traffic clean

# A prebuilt jar rather than `mvn exec`: proxymock sets proxy flags for
# whatever it launches, and Maven's dependency downloads would land in the
# recording as outbound traffic.
APP = java -jar target/graphql-demo.jar

build: target/graphql-demo.jar

target/graphql-demo.jar: pom.xml $(shell find src -name "*.java")
	mvn -q -B package

clean:
	rm -rf proxymock target

PORT ?= 8080

help:
	@echo "graphql-demo (Java) make targets:"
	@echo "  make run       — start the GraphQL server standalone on :$(PORT)"
	@echo "  make record    — start proxymock + the server (foreground)"
	@echo "  make exercise  — one driver pass through proxymock's inbound proxy (2nd terminal)"
	@echo "  make traffic   — continuous driver passes through the inbound proxy"
	@echo "  make clean     — remove the workspace and build output"

run: build
	PORT=$(PORT) $(APP)

# record launches the app AS A CHILD of proxymock so proxy settings are set
# automatically.
record: build
	PORT=$(PORT) proxymock record --app-port $(PORT) -- $(APP)

# exercise hits proxymock's IN proxy on 4143, NOT the app port. Without that
# the inbound side of the recording stays empty.
exercise: build
	@$(APP) -drive -target http://localhost:4143

traffic: build
	@$(APP) -drive -loop -target http://localhost:4143
