# GraphQL demo — Makefile-driven workflow. See README.md for the walkthrough.

.PHONY: help build run record exercise traffic clean

# Prebuilt binary rather than `go run`: proxymock sets proxy env vars for
# whatever it launches, and `go run`'s module lookups would land in the
# recording as outbound traffic to proxy.golang.org.
APP = ./graphql-demo

build:
	@go build -o $(APP) .

# Where `proxymock record` writes when invoked from this directory:
# ./proxymock/recorded-<timestamp>/.
WORKSPACE ?= ./proxymock

# The app's port. Override when something else already holds the default:
#   make record PORT=8099
PORT ?= 8080

help:
	@echo "graphql-demo make targets:"
	@echo "  make run       — start the GraphQL server standalone on :$(PORT)"
	@echo "  make record    — start proxymock + the server (foreground)"
	@echo "  make exercise  — one driver pass through proxymock's inbound proxy (2nd terminal)"
	@echo "  make traffic   — continuous driver passes through the inbound proxy"
	@echo "  make clean     — remove the workspace and binary"
	@echo ""
	@echo "Typical session (2 terminals):"
	@echo "  term A:  make record     # Ctrl-C once the driver finishes"
	@echo "  term B:  make exercise"

run: build
	PORT=$(PORT) $(APP)

# record launches the app AS A CHILD of proxymock so proxy env vars are set
# automatically.
record: build
	PORT=$(PORT) proxymock record --app-port $(PORT) -- $(APP)

# exercise hits proxymock's IN proxy on 4143, NOT the app port. Without that
# the inbound side of the recording stays empty.
exercise: build
	@$(APP) -drive -target http://localhost:4143

traffic: build
	@$(APP) -drive -loop -target http://localhost:4143

clean:
	rm -rf $(WORKSPACE) $(APP)
