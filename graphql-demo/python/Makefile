# graphql-demo, Python edition: the same targets as ../Makefile. See ../README.md.

.PHONY: help build run record exercise traffic clean

# The venv interpreter runs the script directly, so pip never runs under
# proxymock and its package downloads never land in a recording.
APP = .venv/bin/python graphql_demo.py

build: .venv

.venv: requirements.txt
	python3 -m venv .venv
	.venv/bin/pip install -q -r requirements.txt
	@touch $@

clean:
	rm -rf proxymock .venv

PORT ?= 8080

help:
	@echo "graphql-demo (Python) make targets:"
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
