# 09: When Handwritten Mocks Stop Scaling

This stage keeps the complete notifier and contract-test suite, then makes the
test-double decision concrete: the same customer-visible assertion runs once
with a function stub and once with a fake HTTP server.

| Substitute | What the example proves | Cost |
|---|---|---|
| Function stub | Notifier decision logic | Lowest |
| In-memory fake | Stateful behavior across calls | Low |
| In-process fake server | Paths, headers, status handling, and parsing | Medium |
| Captured fixture + live contract check | Whether the assumed protocol still resembles reality | Network and credentials |

Both comparison tests assert that a delayed package causes exactly one send and
one record. The fake-server version additionally exercises the client and
captured response, which is useful only when that extra fidelity addresses a
real risk.

## Run it

```bash
cd java && mvn test
cd node && npm ci && npm test
cd go && go test -v ./...
cd python && python3 -m unittest discover -v
```

Start with the smallest substitute that answers your question. Move up the
ladder when a named gap—not an imagined one—justifies the setup and maintenance.
