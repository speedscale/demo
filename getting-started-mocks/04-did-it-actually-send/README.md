# 04: Did It Actually Send?

The notifier stops returning a message and starts calling a sender. There is no
return value left to assert on, so the tests need a different kind of stand-in:
one that records what it was asked to do.

Same behavior, four languages:

| | Java | Node.js | Go | Python |
|---|---|---|---|---|
| Notifier | [`java/.../notifier/`](java/src/main/java/com/speedscale/mocks/notifier/) | [`node/notifier/`](node/notifier/) | [`go/notifier/`](go/notifier/) | [`python/notifier/`](python/notifier/) |
| Sender seam | `Sender.java` | `send` argument | `Sender` | `Sender` |
| Spy in tests | `SpySender` | `spySender()` | `spySender` | `SpySender` |

## What is here

- A `Sender` seam. `Notify` now returns only an error, or nothing at all.
- A spy in every test: a sender that appends each message to a list. The stub
  answers a question, the spy records an action. Both are stand-ins; they have
  different jobs.
- Every failure case from post 3 now also asserts that nothing was sent.

## Run it

```bash
cd java && mvn test
cd node && npm test
cd go && go test -v ./...
cd python && python3 -m unittest discover -v
```

Seven passing tests in each language.

## What these tests prove

That the notifier asked for exactly one send, with the expected message, when
the carrier reports a delay, and asked for none in every other case.

## What these tests do not prove

That the message was delivered, that the provider formatted or rate-limited it
correctly, or that anyone read it. The spy records the request, not the outcome.

## Try it

Make the spy's send fail, and decide what the notifier should do about it.
