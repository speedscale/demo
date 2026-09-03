.PHONY: test test-go test-java test-node test-python

# Runs every post in every language. Each numbered directory is the notifier
# as it looked at the end of that post, with one subdirectory per language.
test: test-go test-java test-node test-python

test-go:
	go test ./...

test-java:
	@for d in */java; do echo "== $$d"; (cd $$d && mvn -q test) || exit 1; done

test-node:
	@for d in */node; do echo "== $$d"; (cd $$d && npm test) || exit 1; done

test-python:
	@for d in */python; do echo "== $$d"; (cd $$d && python3 -m unittest discover -v) || exit 1; done
