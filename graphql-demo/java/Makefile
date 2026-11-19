# graphql-demo, Java edition: the same targets as ../Makefile. See ../README.md.

.PHONY: help build run record exercise traffic clean fast-lane fast-lane-unpatched fast-lane-mitigation fast-lane-record

# A prebuilt jar rather than `mvn exec`: proxymock sets proxy flags for
# whatever it launches, and Maven's dependency downloads would land in the
# recording as outbound traffic.
APP = java -jar target/graphql-demo.jar

build: target/graphql-demo.jar

target/graphql-demo.jar: pom.xml $(shell find src -name "*.java")
	mvn -q -B package

# The fast lane recording and test config under proxymock/ are committed, so clean leaves them.
clean:
	rm -rf proxymock/recorded-* proxymock/results proxymock/.proxymock target

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

# Security fast lane: replay the committed recording against an image built
# on a given JDK patch level. See ../README.md.
FAST_LANE_UNPATCHED ?= 21.0.12
FAST_LANE_PATCHED ?= 21.0.13
WARMUP ?= 400

fast-lane-image-%:
	docker build -q --build-arg CORRETTO_TAG=$* -t graphql-fast-lane:$* .

fast-lane: fast-lane-image-$(FAST_LANE_PATCHED)
	WARMUP=$(WARMUP) ./fast-lane-check.sh graphql-fast-lane:$(FAST_LANE_PATCHED)

fast-lane-unpatched: fast-lane-image-$(FAST_LANE_UNPATCHED)
	WARMUP=$(WARMUP) ./fast-lane-check.sh graphql-fast-lane:$(FAST_LANE_UNPATCHED)

fast-lane-mitigation: fast-lane-image-$(FAST_LANE_UNPATCHED)
	WARMUP=$(WARMUP) JAVA_TOOL_OPTIONS=-XX:-UseBASE64Intrinsics ./fast-lane-check.sh graphql-fast-lane:$(FAST_LANE_UNPATCHED)

fast-lane-record: fast-lane-image-$(FAST_LANE_UNPATCHED)
	./fast-lane-record.sh graphql-fast-lane:$(FAST_LANE_UNPATCHED)
