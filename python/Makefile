PYTHON ?= python3
VENV ?= .venv
PIP := $(VENV)/bin/pip
PY := $(VENV)/bin/python

.PHONY: install local test capture mock replay fast-lane fast-lane-patched clean

install:
	$(PYTHON) -m venv $(VENV)
	$(PIP) install -r requirements.txt

local:
	FLASK_DEBUG=1 $(PY) app.py

test:
	@./test-all.sh

capture:
	proxymock record --app-port 5001 --out proxymock/demo -- $(PY) app.py

mock:
	proxymock mock --in proxymock/demo -- $(PY) app.py

replay:
	proxymock replay --in proxymock/demo --test-against http://localhost:5001

fast-lane:
	docker build -t fast-lane-demo:candidate .
	./fast-lane-check.sh fast-lane-demo:candidate

# The same check on the CVE-2023-27043 fix (Python 3.12.6); expected to fail.
fast-lane-patched:
	sed 's/python:3.12.5-slim/python:3.12.6-slim/' Dockerfile | docker build -t fast-lane-demo:patched -f - .
	./fast-lane-check.sh fast-lane-demo:patched

clean:
	rm -rf $(VENV) proxymock/demo proxymock/results
