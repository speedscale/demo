# User Journey — trace a customer without traces

A four-service checkout app whose only job is to prove a point: you can
follow one customer's request across every service it touches **without
a single trace ID, span, or line of OpenTelemetry** — because proxymock
already recorded the real traffic, and proxymock-web can filter it by any
value in any field.

```mermaid
graph LR
    Client -->|POST /checkout| gateway
    gateway -->|POST /whoami| auth
    gateway -->|POST /orders| orders
    orders  -->|POST /ship|   shipping
```

## The one identifier, in three kinds of field

Every request carries the customer's email in the ways real systems
smear an identifier around — so a single Full Text filter has to find
it everywhere at once:

| Field kind        | Where                                            |
| ----------------- | ------------------------------------------------ |
| HTTP header       | `X-User-Email` on every hop                      |
| Request body      | `{ "email": ... }` on checkout / whoami / orders / ship |
| Response body     | echoed back by auth / orders / shipping          |

A W3C `traceparent` is propagated too — but only so the waterfall can
*nest* the hops. You never filter on it. That is the whole idea: **the
grouping key is business data (the email), not a trace ID.**

## Run it

```bash
npm install
./record-all.sh          # records ~40 checkouts for 5 named customers
proxymock web --in .     # workspace root — the dir that holds proxymock/
```

`record-all.sh` runs one `proxymock record` per service into a shared
workspace (see the header comment in the script for the port map and the
`*.localtest.me` routing trick that needs no `/etc/hosts` and no sudo).

## See one customer's journey

In proxymock-web:

1. **Filters → Full Text → contains → `ada.lovelace@example.com` → Apply.**
   The grid collapses from every customer's traffic to just Ada's —
   matched across headers, request bodies, and response bodies.
2. Switch the Requests view to the **Trace** lens.
3. Read the waterfall: `gateway → auth`, `gateway → orders`,
   `orders → shipping`, time-ordered and nested, for that one person.

Swap in `grace.hopper@example.com`, `alan.turing@example.com`,
`katherine.johnson@example.com`, or `margaret.hamilton@example.com` to
watch a different customer's path.

## Plain local run (no proxymock)

```bash
SERVICE=auth     PORT=3002 node server.js &
SERVICE=shipping PORT=3004 node server.js &
SERVICE=orders   PORT=3003 node server.js &
SERVICE=gateway  PORT=3001 node server.js &
curl -s localhost:3001/checkout -H 'content-type: application/json' \
  -H 'x-user-email: ada.lovelace@example.com' \
  -d '{"email":"ada.lovelace@example.com","cart":[{"sku":"kbd-01","price":79}]}' | jq
```
