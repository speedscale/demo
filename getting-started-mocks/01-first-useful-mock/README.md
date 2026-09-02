# 01: Your First Useful Mock

The package notifier asks a carrier where a package is. If the carrier says
`delayed`, the notifier produces a message for the customer. Otherwise it stays
quiet.

## What is here

- [`before/`](before/) is the notifier with the carrier call inlined. Its test
  is the one we want to write and cannot: nothing in a test can make the
  carrier report a package as delayed. It is skipped so the module stays
  green.
- [`notifier/`](notifier/) is the same behavior with one seam cut:
  `ShipmentStatus` is a function the caller supplies. The tests supply a
  canned answer. `carrier.go` is the real HTTP implementation, moved behind
  the seam untouched.
- [`cmd/notify/`](cmd/notify/) is the production wiring, so you can see the
  real carrier go into the same slot the tests fill.

## Run it

```bash
go test -v ./...
```

You should see two passing tests in `notifier` and one skipped test in
`before`.

## What these tests prove

The notifier produces a delayed-package message when the carrier reports
`delayed`, and nothing when it reports `delivered`.

## What these tests do not prove

That the real carrier is reachable, that the URL or JSON shape is right, or
that production points at the right host. `carrier.go` never runs under test
here. Post 6 in the series fixes that.

## Try it

Add a third status, `unknown`, and decide what the notifier should do. Write
the test first.
