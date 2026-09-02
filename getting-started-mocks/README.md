# Getting Started with Mocks

This example accompanies the **Getting Started with Mocks and Testing** blog
series. It implements the same package-notifier behavior in four backend
languages:

- [Java](java/)
- [Go](go/)
- [Node.js](node/)
- [Python](python/)

Each implementation asks a carrier dependency for a shipment status. The
production dependency could make an HTTP request, but the tests replace it with
a tiny controlled implementation:

- `delayed` produces a notification message.
- `delivered` produces no notification.

The examples are intentionally small. They demonstrate the testing idea before
introducing framework-specific mocking APIs.

## Run every example

```bash
make test
```

Or run one language at a time:

```bash
make test-java
make test-go
make test-node
make test-python
```

## What these tests prove

They prove the package notifier behaves correctly for carrier statuses the test
controls.

## What these tests do not prove

They do not prove that a real carrier API is reachable, returns the expected
JSON, or is configured correctly in production. Later entries in the series add
HTTP-level and contract tests for those boundaries.
