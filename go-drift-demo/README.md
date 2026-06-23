# Drift Demo

A tiny Go HTTP service whose recorded traffic deliberately drifts across
runs in well-defined fields. Built to exercise
[`proxymock drift`](https://docs.speedscale.com/proxymock/) end-to-end so
you can see the drift report against real recordings with known
expectations.

## What drifts

Each endpoint emits some fields that change every call and some that
stay stable. After two or more recordings, `proxymock drift` should
surface the drifting ones and ignore the stable ones.

| Direction | Endpoint | Drifting fields | Stable fields |
| --- | --- | --- | --- |
| IN | `POST /checkout` | `X-Request-Id` header, body `user_id`, body `cart_id`, body `session_id` | URL path, method, body structure, item names |
| IN | `GET /search` | query `session`, query `_t`, header `X-Request-Id` | path, `q` param, method |
| IN | `GET /profile/u42` | `X-Request-Id`, `X-Forwarded-For` | path, method |
| OUT | `httpbin.org/anything` (POST, from checkout) | headers `Authorization`/`X-Trace-Id`, body `transaction_id`, `request_nonce`, `user_id`, `cart_id`, `payment.auth_token`, `ts`, `request_id`, `client_ip`, `notify_email` | host, path, method, body `merchant_id`/`currency`/`channel`/`items`/`payment.method` |
| OUT | `httpbin.org/anything` (GET, from search/profile) | header `Authorization`/`X-Trace-Id`, query `cache_bust`, `req_uuid` | host, path, method, query `q`/`profile_for` |

The outbound **POST** body is a nested mix of stable and volatile leaves on
purpose — it's the case the Mocks workflow's per-field signature analysis
classifies field-by-field (drop the volatile leaves, keep the stable ones to
restore the replay match). The volatile leaves also span the cause classifier's
value types so the Signature panel shows each typed-drop label:

| Field | Drop label |
| --- | --- |
| `ts` | datetime |
| `request_id`, `req_uuid` (query) | uuid |
| `client_ip` | ip |
| `notify_email` | pii |
| `transaction_id`, `request_nonce`, `cache_bust`, `user_id`, `cart_id`, `payment.auth_token` | random token |

Expected drift locations the report should contain (at minimum):

```
http.req.headers.X-Request-Id[0]
http.req.headers.Authorization[0]
http.req.headers.X-Trace-Id[0]
http.req.url.query.session[0]
http.req.url.query._t[0]
http.req.url.query.cache_bust[0]
http.req.url.query.req_uuid[0]
http.req.bodyBase64.user_id
http.req.bodyBase64.cart_id
http.req.bodyBase64.session_id
http.req.bodyBase64.transaction_id
http.req.bodyBase64.request_nonce
http.req.bodyBase64.ts
http.req.bodyBase64.request_id
http.req.bodyBase64.client_ip
http.req.bodyBase64.notify_email
http.req.bodyBase64.payment.auth_token
```

## Run the demo

`proxymock record` launches the app as a child process, which is the
documented way to get the proxy env vars (`http_proxy`,
`https_proxy`) set automatically so the app's outbound calls flow
through the OUT proxy. Clients hit port **4143** (the IN proxy), not
8080 directly.

```sh
# Terminal A: launches proxymock + the demo app in one command
make record

# Terminal B: hit every endpoint a few times via port 4143 (default 5 cycles)
make exercise

# Stop proxymock (Ctrl-C in terminal A). You have ./proxymock/recorded-<timestamp>/.
# Restart and exercise again to produce a second recording:
make record           # in terminal A
make exercise         # in terminal B
# Repeat for as many recordings as you want.
```

> **Why port 4143, not 8080?** `proxymock record` listens on **4143**
> as the inbound proxy in front of your app (on 8080), and on **4140**
> as the outbound proxy in front of external services. Hitting 8080
> directly bypasses the inbound proxy and produces an empty recording
> — that's the most common "no RRPairs captured" symptom.

## Compare drift

Once you have at least two `recorded-*` directories under `./proxymock`:

```sh
make compare
```

That runs:

```sh
proxymock drift --source ./proxymock/recorded-<a> --source ./proxymock/recorded-<b> ... --sensitivity permissive
```

…and emits a JSON `DriftReport` covering every location whose value
varied across the recordings. You should see all the IN and OUT drift
fields listed above; you should NOT see the stable ones.

## Compare in the web UI

```sh
proxymock web --workspace ./proxymock
```

Then in the browser:

1. **Requests** tab (default landing).
2. **⚡ Automations** → **⇄ Compare traffic for drift**.
3. The source picker lists every `recorded-*` directory in the workspace
   as a dropdown (same dropdown the Requests view uses). Pick two,
   click **Save**, then **▶ Run drift** (or press **D**).
4. Review the drift recommendations with the same J/K/Y/N/S keyboard
   shortcuts the Transform recommendations use. Accepting a record
   writes a wildcard-ignore blueprint under
   `./proxymock/blueprints/`.

## How the drift is generated

The app gives every outbound call a fresh `transaction_id`,
`X-Trace-Id`, `Authorization` token, and `cache_bust` value, so the
OUT-direction recordings naturally diverge run-over-run. The
[`driver.sh`](./driver.sh) helper also generates fresh `X-Request-Id`,
`user_id`, `cart_id`, `session_id`, and `session=` values per call,
which produces IN-direction drift.

Stable fields (paths, methods, hostnames, item names, JSON structure)
stay identical across recordings, so they should NOT appear in the
drift report. If they do, that's a bug in either the demo or the
drift detector.

## Configuration

| Env var | Default | Notes |
| --- | --- | --- |
| `UPSTREAM` | `https://httpbin.org` | Override to point outbound calls at a different echo service, or to a local mock for offline use. |
| `COUNT` | `5` | (driver.sh) How many times to hit each endpoint per invocation. |
| `HOST` | `http://localhost:8080` | (driver.sh) Where to send the inbound calls. |
| `WORKSPACE` | `./proxymock` | (Makefile) Where proxymock writes recordings. |
