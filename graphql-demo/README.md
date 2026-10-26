# GraphQL Demo

A small GraphQL API plus a traffic driver, purpose-built for developing and
validating Speedscale's GraphQL transform capabilities. The server uses
[`graphql-go`](https://github.com/graphql-go/graphql) — the same library
Speedscale uses internally to parse GraphQL bodies — so every incoming query is
parsed and validated for real. A transform that mangles a query produces a
visible GraphQL error on replay: the server is a correctness oracle, not just a
traffic sink.

## Four languages, one API

The API and its driver exist in four editions. Each one defines the same
schema in code with its language's standard GraphQL library, answers every
request the same way, and has a driver that sends byte-for-byte the same
requests, so any walkthrough written against one runs unchanged against the
others.

| Edition | Directory | Library | Build | Run the server | Run the driver |
|---|---|---|---|---|---|
| Go | `.` | [graphql-go](https://github.com/graphql-go/graphql) | `go build -o graphql-demo .` | `./graphql-demo` | `./graphql-demo -drive` |
| Java | `java/` | [graphql-java](https://www.graphql-java.com/) | `mvn -q package` | `java -jar target/graphql-demo.jar` | `java -jar target/graphql-demo.jar -drive` |
| Node.js | `node/` | [graphql-js](https://github.com/graphql/graphql-js) | `npm ci` | `node graphql-demo.js` | `node graphql-demo.js -drive` |
| Python | `python/` | [graphql-core](https://github.com/graphql-python/graphql-core) | `python3 -m venv .venv && .venv/bin/pip install -r requirements.txt` | `.venv/bin/python graphql_demo.py` | `.venv/bin/python graphql_demo.py -drive` |

Every edition takes the same flags (`-drive`, `-target URL`, `-loop`) and the
same `PORT` variable, and every directory has the same make targets. Where the
editions differ, it is the libraries talking:

- The order of a type's fields. graphql-go lists them alphabetically; the
  others keep the order they were defined in. Anything generated from the
  schema, such as `proxymock generate` output, follows that order.
- The wording of validation and syntax errors, and graphql-java's
  `extensions.classification` on every error. Resolver errors such as
  `token expired` carry the same message in all four.
- Whether the driver's HTTP client sends `localhost` through a proxy. Go's and
  Java's never do. Node.js (with `NODE_USE_ENV_PROXY=1`, which proxymock sets)
  and Python's `urllib` do.

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

From the edition's directory (the Go edition shown):

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
