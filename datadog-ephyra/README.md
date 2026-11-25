# Booking API: recorded replay and an ephyra property test

This folder tests the booking API from [`../dotnet-airline`](../dotnet-airline) two ways against the same mocked dependencies. It replays the recorded traffic with [proxymock](https://docs.speedscale.com/proxymock/), and it runs a property test written with [ephyra](https://crates.io/crates/ephyra), Datadog's property-testing library for Rust. It does both on the API as it is and on a copy with one change applied, `patches/checkout-decline.patch`.

The booking API searches flights with a schedule partner, prices cart lines with a pricing partner, authorizes payment with a payment gateway, and keeps carts and orders in Redis. `dotnet-airline` is not modified: the script copies its source into `.build/`, applies the patch to the copy, and reads the committed recording.

## Prerequisites

- .NET 8 SDK. A user-local install in `~/.dotnet` is picked up.
- Docker, for a Redis container used by the property test. The `redis:7-alpine` image is pulled on the first run.
- Rust with cargo. ephyra and the other crates are fetched on the first build.
- proxymock, at `~/.speedscale/proxymock` or on `PATH` ([install guide](https://docs.speedscale.com/proxymock/getting-started/installation/)).
- `curl` and `patch`.

No Datadog or Speedscale account is used. The script checks these first and lists anything missing.

## Run it

```bash
make demo
```

or `./run-demo.sh`. It picks free local ports, stops everything it started when it exits (including on Ctrl-C), and prints a summary. The first run downloads the .NET packages, the crates and the Redis image; later runs reuse the builds, the crates and the image without the network. proxymock itself checks in with Speedscale at startup when its configuration has a Speedscale tenant, so whether it runs offline depends on that configuration. With the builds in place a run takes about 30 seconds.

Settings, all optional: `EPHYRA_SEED` (default 1) and `EPHYRA_TESTS` (default 200) for the property test, `STARTUP_TIMEOUT` (default 90 seconds) for each process to come up, and `STEP_TIMEOUT` (default 600 seconds) for each build, replay or test.

## What runs

1. **Recorded replay.** proxymock serves the schedule partner, the pricing partner, the payment gateway and Redis from `../dotnet-airline/proxymock/recording`, and replays the 27 recorded requests (searches, carts, checkouts, orders, and a few error cases) against the API. This runs on both builds.
2. **Property test.** `property-tests/tests/booking.rs` generates bookings: an itinerary of one to four legs, each a recorded route on a date up to 30 days after the recorded one, a flight from the schedule and a fare class; one to nine passengers; and one to three checkout attempts using the card tokens from the recording, one of which the gateway declines. For each booking it searches, creates a cart, adds the legs and checks out, and compares every response with what the recording implies: each line costs the passengers times the recorded fare for its class plus the $4.50 booking fee, the order charges the sum of its lines, a declined card leaves the cart open for the next attempt, and a ticketed cart answers later attempts with its record locator. The partners are the same recorded mocks as in step 1; Redis is a fresh container, because the generated bookings write keys and values the recording does not contain. This also runs on both builds.
3. **Written RRPairs.** When the property fails, the test writes the shrunk booking as inbound RRPairs in `proxymock/regressions-ephyra/`, with the responses the property expects. The script replays them on both builds against an empty Redis and the same partner mocks.

## The mocks

`proxymock/recorded-partners/` holds the schedule, pricing and payment exchanges copied from the airline recording without edits. The generated bookings send requests the recording does not contain exactly, so two blueprints in `proxymock/blueprints/` adjust how the mock matches and answers them:

- Payment authorizations match on the card token. The amount and the cart reference are masked, since they change with every booking. This transform came from proxymock's mock match analysis of a run whose payment calls missed.
- Pricing quotes match on fare class, and the response carries the flight number and passenger count from the request. Schedule searches match on route, and every flight in the response carries the requested date. These use `var_store` on the request and `var_load` on the response.

The script reports the mock's hits and misses for every step from `proxymock/results/mock-*/responder-counts.json`.

## Results from a run

From a run with the default seed on macOS:

| Step | Current build | Changed build |
|---|---|---|
| Recorded replay | 27 of 27 matched; mock 73 hits, 0 misses | 27 of 27 matched; mock 72 hits, 0 misses |
| Property test | 200 bookings passed; mock 1051 hits, 0 misses | first failure at generated case 7; mock 49 hits, 0 misses |
| Written RRPairs | 4 of 4 matched; mock 3 hits, 0 misses | 3 of 4 matched; mock 2 hits, 0 misses |

The change in `patches/checkout-decline.patch` returns a declined payment without releasing the cart's checkout claim. The recording has one declined checkout and nothing after it on that cart, so the recorded replay matches on both builds. On the changed build ephyra's first failing booking had two legs, four passengers and a declined card followed by an approved one, and it shrank that to one leg, one passenger, `tok_decline` and then `tok_mc_4444`. The second attempt got `409 checkout already in progress` where the property expected a ticketed order. The four RRPairs written from that booking are the create-cart, add-item and two checkout requests, and the last one is the response that differs on the changed build.

Over seeds 1 to 10 the first failing case on the changed build was 7, 7, 22, 4, 4, 8, 15, 4, 8 and 4, and each shrank to the same one-leg, one-passenger booking. The current build passed 200 bookings for each of those seeds. Itineraries and checkout attempts start at one entry and grow with ephyra's size parameter, so the earliest a booking can try a second card is case 4.

## Running the property test by hand

Start the partner mocks from this folder, a Redis, and the API from `../dotnet-airline` pointed at them (see `start_mock` and `start_app` in `run-demo.sh`), then:

```bash
API_URL=http://127.0.0.1:18090 cargo test --manifest-path property-tests/Cargo.toml --test booking -- --nocapture
```

`EPHYRA_SEED`, `EPHYRA_TESTS` and `EPHYRA_REPLAY` work as described in ephyra's documentation. `AIRLINE_RECORDING` and `REGRESSIONS_DIR` override where the test reads the recording and writes RRPairs.
