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

## Record locally with `proxymock record` (no Kubernetes)

`proxymock record` runs two smart proxies around your app — an **inbound** proxy
on `:4143` (in front of the app) and an **outbound** proxy on `:4140` (behind
it). Requests through either are recorded. We record the gateway: its inbound
`/checkout` plus its fan-out to the backends (and `pricing → tax`).

There's a one-command helper:

```bash
cd scenarios/trace-demo
./record-local.sh            # terminal 1: starts backends + records the gateway
```

Then drive traffic and view it:

```bash
# terminal 2: at least 100 distinct traces through the inbound proxy (:4143)
ROLE=loadgen GATEWAY_URL=http://localhost:4143 COUNT=150 LOOP=false /tmp/trace-demo

proxymock web                # browse the capture; filter X-Trace-Id, click Trace
```

Ctrl-C the recorder in terminal 1 when you're done; it stops the backends too.

### Why the downstream URLs use `$(hostname)`, not `localhost`

`proxymock record` captures the gateway's **outbound** calls only when they go
through its outbound proxy — and Go's HTTP client (via `http_proxy`/`https_proxy`)
**bypasses the proxy for `localhost` and loopback addresses**. So the helper
points the gateway (and pricing → tax) at `http://$(hostname):<port>` instead,
which Go routes through proxymock's `:4140` proxy and records. Inbound is
unaffected — drive it at `localhost:4143`.

### Doing it by hand

If you'd rather not use the script, the equivalent is: start `cart`, `tax`,
`payment`, `shipping` on their ports; start `pricing` with
`http_proxy=https_proxy=http://localhost:4140` and `TAX_URL=http://$(hostname):8085`;
then `proxymock record --app-port 8080 -- env ROLE=gateway PORT=8080 CART_URL=http://$(hostname):8081 … /tmp/trace-demo`.
See `record-local.sh` for the exact commands.
