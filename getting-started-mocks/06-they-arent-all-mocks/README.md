# 06: They Aren't All Mocks

The notifier now remembers which tracking numbers have already produced a
notification. That requires a stateful test double: an in-memory fake.

Each language demonstrates the same five roles:

- a **stub** returns a canned carrier status;
- a **spy** records messages for assertions;
- a **fake** stores notification state;
- a **dummy** replaces real sleeping; and
- a strict **mock** owns its expectations and verifies itself.

The important behavior is that calling `notify` repeatedly for the same delayed
package sends and records exactly one notification.

## Run it

```bash
cd java && mvn test
cd node && npm test
cd go && go test -v ./...
cd python && python3 -m unittest discover -v
```

No mocking framework is required. The doubles are deliberately small enough to
show their behavior directly.
