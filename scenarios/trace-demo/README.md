# trace-demo

A small distributed "checkout" stack that emits **real distributed traces** when
recorded with Speedscale/proxymock. It exists to generate test data for the
proxymock-web **Trace** waterfall: deploy it, record, then filter the Requests
grid by one `X-Trace-Id` and watch the view reconstruct that request's full
journey across services.

## Topology

One `/checkout` request fans out across six services and two levels of depth:

```
loadgen ─▶ gateway ─┬─▶ cart      (GET  /cart/validate)
                    ├─▶ pricing   (POST /price) ─▶ tax (GET /tax/calculate)
                    ├─▶ payment   (POST /charge)        ← fails ~12% (error spans)
                    └─▶ shipping  (POST /ship)
```

Every hop propagates W3C `traceparent`, Zipkin **B3** (`X-B3-TraceId/SpanId/ParentSpanId`),
and a stable **`X-Trace-Id`** that is constant across all hops of one request.
`X-Trace-Id` is your grouping key (filter on it); the B3 span ids give the
waterfall its exact parent/child nesting.

It's all one Go binary; `ROLE` selects which service (or the `loadgen` client)
it runs as — so the whole stack is a single image.

## At least 100 traces

`loadgen` drives `COUNT` (default **150**) distinct traces per pass — each a
fresh root trace id — then loops (`LOOP=true`) so any recording window keeps
seeing traffic. 150 traces take ~25s at the default 150 ms spacing.

## Deploy to minikube

Builds the image straight into minikube's Docker (no registry needed):

```bash
cd scenarios/trace-demo
make minikube          # or: ./k8s/deploy-minikube.sh
```

This brings up `gateway`, `cart`, `pricing`, `tax`, `payment`, `shipping`, and
`loadgen` in the `trace-demo` namespace. Both the **client** (`loadgen`) and the
**servers** are deployed and annotated `capture.speedscale.com/enabled: "true"`,
so both sides of every call are recorded.

Tear down with `make undeploy`.

## Record and view

1. Record the `trace-demo` namespace with Speedscale (operator capture) or
   proxymock.
2. In proxymock-web → **Requests**, open **Filters** and add a **Request Header**
   filter on `X-Trace-Id` set to any one captured value (the grid shows them).
3. Click the **Trace** toggle. You'll see that request's waterfall — gateway at
   the root, its downstream calls nested beneath, `pricing → tax` one level
   deeper, and a red bar on any trace whose payment failed. Click any bar to open
   its RRPair detail.

Tip: because the waterfall is driven by the *filtered* grid, adding a
`Direction = IN` (or `OUT`) filter alongside `X-Trace-Id` shows just the
server-side (or client-side) half of each hop.

## Run locally (no Kubernetes)

Each role is just an env var, so you can run the stack on your laptop and record
it with the proxymock CLI:

```bash
cd app
ROLE=tax      PORT=8085 go run . &
ROLE=cart     PORT=8081 go run . &
ROLE=shipping PORT=8084 go run . &
ROLE=payment  PORT=8083 go run . &
ROLE=pricing  PORT=8082 TAX_URL=http://localhost:8085 go run . &
ROLE=gateway  PORT=8080 \
  CART_URL=http://localhost:8081 PRICING_URL=http://localhost:8082 \
  PAYMENT_URL=http://localhost:8083 SHIPPING_URL=http://localhost:8084 go run . &
ROLE=loadgen  GATEWAY_URL=http://localhost:8080 COUNT=150 LOOP=false go run .
```
