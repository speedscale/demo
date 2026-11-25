# Mocked partners and ephyra property tests

A small proof of concept of how two tools fit together:

- **Speedscale proxymock** captures real traffic and turns it into mock backends, so a service runs and is replayed without its dependencies.
- **Datadog ephyra** is an open-source property-testing library. Here it generates bookings seeded from the recorded traffic and looks for a counterexample.

ephyra does the testing. The mocks give it a safe place to run, and the recording gives it real bookings to start from.

The service under test is the booking API from [`../dotnet-airline`](../dotnet-airline): it shops flights from a schedule partner, prices a cart with a pricing partner, authorizes payment with a payment gateway, and keeps carts and orders in Redis. Nothing here changes that demo; this folder builds the API from its source and reads its committed recording.

## Prerequisites

- .NET 8 SDK, to build and run the booking API. A user-local install in `~/.dotnet` is picked up automatically.
- Docker, to run a throwaway Redis for the property test. The `redis:7-alpine` image is pulled on first run.
- Rust with cargo, to build and run the property test. ephyra is fetched from crates.io on first build.
- proxymock, at `~/.speedscale/proxymock` or on `PATH`. See the [proxymock install guide](https://docs.speedscale.com/proxymock/getting-started/installation/).
- `curl` and `nc`.

The partner simulator, a local Redis and a Datadog account are not needed.

## Run it

From this folder:

```bash
make demo
```

or `./run-demo.sh`. It uses ports 18090, 25051 to 25053, 26390 and 26391, and stops if any of them is taken.

## What it shows

1. **Capture.** `../dotnet-airline/proxymock/recording/` holds 27 inbound requests (searches, carts, checkouts, orders) and everything the API sent while serving them: 3 schedule searches, 4 pricing quotes, 4 payment authorizations and 62 Redis commands.
2. **Mock backends and replay.** proxymock serves all three partners and Redis from the recording, and `proxymock replay` sends the recorded requests to the API and passes 27 of 27 with `--fail-if "requests.response-match-pct<100"`.
3. **ephyra checks a property.** `property-tests/tests/pricing.rs` states one rule: an order costs its passengers times the per-passenger fare (base fare, taxes and the $4.50 booking fee), on the cart line and on the order. Each case picks a route from the recorded searches, books one of the flights the mocked schedule returns, and chooses 1 to 9 passengers and a fare. ephyra plays the pricing partner, so the fare is whatever it generated, and proxymock mocks the schedule and the payment gateway. On the API as it is, 200 bookings pass.
4. **ephyra finds a bug.** `../dotnet-airline/demo/regression.patch` moves the booking fee outside the per-passenger price, so it is charged once per booking. Against that build ephyra fails and shrinks the booking to 2 passengers on the first recorded flight with a zero fare: expected 9.00, charged 4.50.
5. **Back into Speedscale.** The test writes the shrunk booking as RRPairs under `proxymock/regressions-ephyra/`: the inbound create-cart and add-item requests with the totals the property expects, and the pricing partner's quote as an outbound mock. `proxymock replay` passes them on the current build and fails them on the patched one (recorded 9.00, observed 4.50), so the finding becomes a regression test.

## Why Redis is real in the property test

The API writes each partner quote into Redis. A generated fare changes that write, and proxymock's Redis mock answers only the commands it recorded, so the property test runs a throwaway Redis container instead. The replay in step 2 still mocks Redis from the recording.

## The payment mock

`proxymock/recorded-partners/` holds the schedule responses and one approved payment from the airline recording. The payment request carries the order amount and the cart ID, which change with every generated booking. `proxymock/blueprints/` holds the transform that masks those two fields so the recorded approval answers any amount. It was produced by proxymock's mock match analysis (`mocks` analyze, then accept) from a run whose payment calls missed.

## Layout

| Path | Purpose |
|---|---|
| `run-demo.sh` | Builds the API twice, replays, runs the property on both builds, replays the regression |
| `property-tests/src/lib.rs` | Reads routes, fare bases and a card token from the recording, plays the pricing partner, calls the API, writes the regression RRPairs |
| `property-tests/tests/pricing.rs` | The ephyra property |
| `proxymock/recorded-partners/` | Schedule and payment mocks for the property test, copied from the airline recording |
| `proxymock/blueprints/` | The transform that lets the payment mock answer any amount |
| `proxymock/regressions-ephyra/` | Written by the property test; ignored by git |

## Running the pieces by hand

Start the partner mocks from this folder, a Redis on 26391, and the API from `../dotnet-airline` with `SCHEDULE_URL=http://127.0.0.1:25051 PRICING_URL=http://127.0.0.1:25052 PAYMENTS_URL=http://127.0.0.1:25053 REDIS_ADDR=127.0.0.1:26391 PORT=18090` (see `run-demo.sh`), then:

```bash
cargo test --manifest-path property-tests/Cargo.toml --test pricing -- --nocapture
```

`API_URL`, `PRICING_ADDR`, `AIRLINE_RECORDING` and `REGRESSIONS_DIR` override the defaults the test uses.
