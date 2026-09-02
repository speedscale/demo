# 03: Make Failure Boring

The notifier from post 2, now facing a carrier that fails. Nothing new is
mocked. The same shipment-status seam simply starts returning bad news, and a
second seam is added for sleep so retry tests do not wait in real time.

Same behavior, four languages:

| | Java | Node.js | Go | Python |
|---|---|---|---|---|
| Notifier and retry | [`java/.../notifier/`](java/src/main/java/com/speedscale/mocks/notifier/) | [`node/notifier/`](node/notifier/) | [`go/notifier/`](go/notifier/) | [`python/notifier/`](python/notifier/) |
| Production wiring | `Main.java` | [`node/cli.js`](node/cli.js) | [`go/cmd/notify/`](go/cmd/notify/) | [`python/cli.py`](python/cli.py) |
| Carrier unavailable | `CarrierUnavailableException` | `CarrierUnavailableError` | `ErrCarrierUnavailable` | `CarrierUnavailableError` |
| Timeout | `HttpTimeoutException` | `TimeoutError` | `context.DeadlineExceeded` | `TimeoutError` |

## What is here

- The carrier lookup can now fail. The notifier retries up to three times and
  surfaces the last failure if the budget runs out.
- `sleep` is the second seam. Production passes the real one. Every test passes
  a no-op, so the retry tests finish instantly.
- An unrecognised status is not an error. It simply means there is nothing to
  tell the customer, and it must not crash the run.

## Run it

```bash
cd java && mvn test
cd node && npm test
cd go && go test -v ./...
cd python && python3 -m unittest discover -v
```

Seven passing tests in each language.

## What these tests prove

How the notifier responds to each class of failure: a carrier that refuses, a
carrier that never answers, a carrier that returns something unrecognised, one
that recovers on a second attempt, and one that never recovers.

## What these tests do not prove

That the real carrier produces those failures in that shape. Every failure here
was invented by the test. Post 7 puts a real HTTP client in front of a fake
server; post 8 is about what happens when the invention drifts from the truth.

## Try it

Make the retry budget configurable instead of a constant, then test the
boundary: a carrier that fails exactly as many times as the budget allows.
