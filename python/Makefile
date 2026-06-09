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
	curl -sf http://localhost:5001/models >/dev/null
	curl -sf http://localhost:5001/models/deepseek-ai/DeepSeek-R1 >/dev/null
	curl -sf http://localhost:5001/llm/models >/dev/null
	curl -sf http://localhost:5001/nasa >/dev/null
	curl -sf http://localhost:5001/events >/dev/null

capture:
	proxymock record --out proxymock/demo -- $(PY) app.py

mock:
	proxymock mock --in proxymock/demo -- $(PY) app.py

replay:
	proxymock replay --in proxymock/demo --test-against http://localhost:5001

clean:
	rm -rf $(VENV) proxymock
