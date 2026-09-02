.PHONY: test test-java test-go test-node test-python

test: test-java test-go test-node test-python

test-java:
	cd java && mvn test

test-go:
	cd go && go test ./...

test-node:
	cd node && npm test

test-python:
	cd python && python3 -m unittest discover -s tests -v
