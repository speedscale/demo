# 01: Your First Useful Mock

The package notifier asks a carrier where a package is. If the carrier says
`delayed`, the notifier produces a message for the customer. Otherwise it stays
quiet.

Same behavior, three languages:

| | Java | Node.js | Go |
|---|---|---|---|
| Tightly coupled "before" | [`java/.../before/`](java/src/main/java/com/speedscale/mocks/before/) | [`node/before/`](node/before/) | [`go/before/`](go/before/) |
| Refactored with a seam | [`java/.../notifier/`](java/src/main/java/com/speedscale/mocks/notifier/) | [`node/notifier/`](node/notifier/) | [`go/notifier/`](go/notifier/) |
| Production wiring | `Main.java` | [`node/cli.js`](node/cli.js) | [`go/cmd/notify/`](go/cmd/notify/) |
| "Nothing to send" | empty `Optional` | `null` | `""` |

## What is here

- **`before/`** is the notifier with the carrier call inlined. Its test is the
  one we want to write and cannot: nothing in a test can make the carrier
  report a package as delayed. It is skipped (`@Disabled`, `{ skip }`,
  `t.Skip`) so every suite stays green.
- **`notifier/`** is the same behavior with one seam cut: the shipment-status
  lookup is something the caller supplies. The tests supply a canned answer.
  The real HTTP implementation (`HttpShipmentStatus`, `httpShipmentStatus`,
  `HTTPShipmentStatus`) is the original code moved behind the seam untouched.
- The production wiring shows the real carrier going into the same slot the
  tests fill.

## Run it

```bash
cd java && mvn test
cd node && npm test
cd go && go test -v ./...
```

Each suite reports two passing tests in `notifier` and one skipped test in
`before`.

## What these tests prove

The notifier produces a delayed-package message when the carrier reports
`delayed`, and nothing when it reports `delivered`.

## What these tests do not prove

That the real carrier is reachable, that the URL or JSON shape is right, or
that production points at the right host. The HTTP implementation never runs
under test here. Post 6 in the series fixes that.

## Try it

Add a third status, `unknown`, and decide what the notifier should do. Write
the test first.
