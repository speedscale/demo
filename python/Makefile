PYTHON ?= python3
VENV ?= .venv
PIP := $(VENV)/bin/pip
PY := $(VENV)/bin/python

.PHONY: install local test capture mock replay fast-lane clean

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

clean:
	rm -rf $(VENV) proxymock/demo proxymock/results
