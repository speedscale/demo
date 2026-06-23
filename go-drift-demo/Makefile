# Drift demo — Makefile-driven workflow. See README.md for the full flow.

.PHONY: run record exercise compare clean help

# Where `proxymock record` writes by default when invoked from this
# directory: ./proxymock/recorded-<timestamp>/ (see
# newProxymockDefaultOutDir in speedctl/cli/proxymock.go — the
# "proxymock/" prefix is auto-added when you're not already inside a
# directory named "proxymock"). The compare target globs under here.
WORKSPACE ?= ./proxymock

help:
	@echo "drift-demo make targets:"
	@echo "  make record              — start proxymock + the demo app (foreground)"
	@echo "                             writes to $(WORKSPACE)/recorded-<timestamp>/"
	@echo "  make exercise            — hit every endpoint via driver.sh (default COUNT=5)"
	@echo "                             talks to port 4143 (proxymock IN proxy), NOT 8080"
	@echo "  make compare             — run 'proxymock drift' across every recorded-* dir under $(WORKSPACE)"
	@echo "  make clean               — remove the workspace directory"
	@echo "  make run                 — start the demo app standalone on :8080 (skips proxymock; debug only)"
	@echo ""
	@echo "Typical session (3 terminals):"
	@echo "  term A:  make record             # launches proxymock + the app in one go"
	@echo "  term B:  make exercise           # produces recorded-<ts1>"
	@echo "           (Ctrl-C the record, re-run; repeat exercise) -> recorded-<ts2>, recorded-<ts3>..."
	@echo "  term C:  make compare            # surfaces the drift across all of them"

# record launches the app AS A CHILD of proxymock. That's the
# documented way to get proxy env vars set automatically (the alternative
# is to export http_proxy/https_proxy yourself before `make run`).
# Result: inbound traffic to :4143 is captured; outbound from the app
# is routed through :4140 and captured too. Default upstream is
# http://httpbin.org so TLS interception isn't needed during the demo.
record:
	proxymock record --app-port 8080 -- go run main.go

# exercise hits proxymock's IN proxy on port 4143 (NOT the app on
# 8080). Without that the inbound side of the recording stays empty.
exercise:
	@HOST=http://localhost:4143 ./driver.sh

# run standalone — useful for verifying the app itself works without
# proxymock in the loop. Records produced this way are EMPTY because
# the inbound proxy isn't reached and the outbound env vars aren't set.
# Use `make record` for the real workflow.
run:
	go run main.go

compare:
	@dirs=$$(ls -d $(WORKSPACE)/recorded-* 2>/dev/null | head -10); \
	if [ -z "$$dirs" ]; then \
		echo "no recorded-* dirs in $(WORKSPACE) yet. Record the demo first."; \
		exit 1; \
	fi; \
	args=""; for d in $$dirs; do args="$$args --source $$d"; done; \
	echo "proxymock drift $$args"; \
	proxymock drift $$args --sensitivity permissive

clean:
	rm -rf $(WORKSPACE)
