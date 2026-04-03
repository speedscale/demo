PYTHON ?= python3
VENV ?= .venv
PIP := $(VENV)/bin/pip
PY := $(VENV)/bin/python

.PHONY: install local test capture mock replay clean

install:
	$(PYTHON) -m venv $(VENV)
	$(PIP) install -r requirements.txt

local:
	$(PY) app.py

test:
	curl -sf http://localhost:5001/healthz
	curl -sf http://localhost:5001/spacex/launches >/dev/null

capture:
	HTTP_PROXY=http://127.0.0.1:4140 HTTPS_PROXY=http://127.0.0.1:4140 proxymock record --app-port 5001 -- $(PY) app.py

mock:
	proxymock mock --in-dir ./proxymock/recorded -- $(PY) app.py

replay:
	proxymock replay --in-dir ./proxymock/recorded --test-against http://localhost:5001 -- $(PY) app.py

clean:
	rm -rf $(VENV) proxymock
