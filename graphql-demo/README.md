# GraphQL Demo

A small GraphQL API plus a traffic driver, purpose-built for developing and
validating Speedscale's GraphQL transform capabilities. The server uses
[`graphql-go`](https://github.com/graphql-go/graphql) — the same library
Speedscale uses internally to parse GraphQL bodies — so every incoming query is
parsed and validated for real. A transform that mangles a query produces a
visible GraphQL error on replay: the server is a correctness oracle, not just a
traffic sink.

## What the traffic covers

One driver pass sends 7 GraphQL operations plus 2 negative cases, chosen so the
recording exercises every document shape a transform path language has to
address:

| Case | Exercises |
|---|---|
| `Session` | dynamic data in **variables**: a signed HS256 JWT (verified server-side, 5-minute expiry) and a rotating request id |
| `CreateUser` | nested **input object** with an inline literal (`plan: "pro"`), a **list argument**, and a rotating email variable |
| `Dashboard` | **aliases** (`me` / `teammate`) sharing a **named fragment** |
| `Find` | **union** result with **inline fragments** and `__typename` noise |
| `GetPlans` / `GetUser` | one **multi-operation document**; the request's `operationName` selects which runs |
| `Track` | a JSON document serialized **into a string argument** |
| APQ | negative: persisted-query hash with no query text — nothing to edit |
| `POST /api/search` | negative: a REST body with a top-level `"query"` key that must not be treated as GraphQL |

Responses derive deterministically from inputs; the volatility lives in the
**requests** (token, email, request id), which is where transforms do their
work.

## The JWT is the punchline

`Session` verifies its token: bad signature or expired is a GraphQL error, and
tokens expire after **5 minutes**. Record a pass, wait five minutes, replay —
the Session call fails until a transform (e.g. `jwt_resign` on the token
variable) fixes the traffic. The signing secret is fixed and published:
`speedscale-demo-secret` (HS256).

## Running it

```bash
make run                 # server alone on :8080
./graphql-demo -drive    # one driver pass against :8080 (smoke test)
```

## Recording with proxymock

Two terminals:

```bash
# term A — proxymock launches the server as its child
make record

# term B — drive through the inbound proxy (:4143), NOT the app port
make exercise            # one pass
make traffic             # continuous passes
```

Recordings land in `./proxymock/recorded-<timestamp>/`. A baseline recording of
one pass is checked in as a fixture: it shows each GraphQL request body
converted to Speedscale's JSON representation (the raw `graphql-go` AST), which
is the input the transform system operates on.
