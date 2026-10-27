"""GraphQL demo, Python edition.

The same API and driver as the Go version in the parent directory: same
schema, same resolvers, and a driver that sends byte-for-byte the same
requests, so every proxymock walkthrough runs unchanged against either one.

The server is built on graphql-core, the Python port of the GraphQL reference
implementation, with the schema defined in code. It parses and validates every
incoming query, so a transform that mangles a query produces a visible GraphQL
error on replay.

Run the server:            python graphql_demo.py
Exercise it once:          python graphql_demo.py -drive
Continuous traffic:        python graphql_demo.py -drive -loop
Through proxymock (:4143): python graphql_demo.py -drive -target http://localhost:4143
"""

import argparse
import base64
import hashlib
import hmac
import json
import logging
import os
import secrets
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from graphql import (
    GraphQLArgument,
    GraphQLBoolean,
    GraphQLError,
    GraphQLField,
    GraphQLInputField,
    GraphQLInputObjectType,
    GraphQLInt,
    GraphQLList,
    GraphQLNonNull,
    GraphQLObjectType,
    GraphQLSchema,
    GraphQLString,
    GraphQLUnionType,
    graphql_sync,
)

# JWT_SECRET signs and verifies the demo session tokens. It is deliberately a
# fixed, published value so a jwt_resign transform can be configured against
# it without any secret management.
JWT_SECRET = b"speedscale-demo-secret"

# TOKEN_TTL_SECONDS keeps recorded sessions short-lived on purpose: replay a
# recording more than five minutes after capture and the Session query fails
# with "token expired" until a transform regenerates or re-signs the token.
TOKEN_TTL_SECONDS = 5 * 60

# Go's log package format (2006/01/02 15:04:05), so driver output reads the
# same in every language.
logging.basicConfig(format="%(asctime)s %(message)s", datefmt="%Y/%m/%d %H:%M:%S", level=logging.INFO)
log = logging.getLogger("graphql-demo")


def main():
    # Single-dash long flags match the Go version (-drive, -target URL), so
    # the two are interchangeable in scripts and docs.
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("-drive", action="store_true", help="exercise the API instead of serving it")
    parser.add_argument("-target", default="http://localhost:8080", help="base URL the driver sends to")
    parser.add_argument("-loop", action="store_true", help="with -drive, keep sending traffic until interrupted")
    parser.add_argument("-interval", type=float, default=2.0, help="with -drive -loop, seconds between passes")
    args = parser.parse_args()

    if args.drive:
        run_driver(args.target, args.loop, args.interval)
        return
    run_server()


# ---------------------------------------------------------------------------
# Server
# ---------------------------------------------------------------------------


def run_server():
    schema = build_schema()

    class Handler(BaseHTTPRequestHandler):
        # Keep-alive, like the Go and Node.js servers; write_json always sets
        # Content-Length, which HTTP/1.1 needs.
        protocol_version = "HTTP/1.1"

        def do_POST(self):
            if self.path == "/graphql":
                handle_graphql(schema, self)
            elif self.path == "/api/search":
                handle_rest_search(self)
            else:
                write_json(self, 404, {"error": "not found"})

        def do_GET(self):
            if self.path == "/health":
                write_json(self, 200, {"status": "ok"})
            else:
                write_json(self, 404, {"error": "not found"})

        def log_message(self, format, *args):
            # The GraphQL handler logs each operation; per-request access
            # lines would only repeat it.
            pass

    port = int(os.environ.get("PORT", "8080"))
    server = ThreadingHTTPServer(("", port), Handler)
    log.info("graphql-demo serving on :%d (POST /graphql)", port)
    server.serve_forever()


def handle_graphql(schema, handler):
    try:
        body = json.loads(read_body(handler))
    except ValueError:
        write_json(handler, 400, {"errors": [{"message": "body is not valid JSON"}]})
        return

    # APQ negative case: hash but no query text. Real servers answer
    # PersistedQueryNotFound on a cache miss; so does this one. The point for
    # Speedscale is that there is no query text to convert or edit.
    if not body.get("query"):
        if (body.get("extensions") or {}).get("persistedQuery"):
            write_json(handler, 200, {
                "errors": [{"message": "PersistedQueryNotFound", "extensions": {"code": "PERSISTED_QUERY_NOT_FOUND"}}],
            })
            return
        write_json(handler, 400, {"errors": [{"message": "no query provided"}]})
        return

    operation_name = body.get("operationName") or None
    result = graphql_sync(
        schema,
        body["query"],
        variable_values=body.get("variables"),
        operation_name=operation_name,
    )
    if result.errors:
        log.info('graphql op="%s" errors=%s', operation_name or "", "; ".join(e.message for e in result.errors))
    else:
        log.info('graphql op="%s" ok', operation_name or "")
    # Per GraphQL-over-HTTP convention, execution and validation errors ride
    # in the 200 envelope's errors array.
    write_json(handler, 200, result.formatted)


def handle_rest_search(handler):
    """The fake-GraphQL negative case: a plain REST endpoint whose body has a
    top-level "query" key. It lives at /api/search so URL-suffix GraphQL
    detection must ignore it."""
    try:
        body = json.loads(read_body(handler))
    except ValueError:
        body = {}
    query = body.get("query")
    if not query:
        write_json(handler, 400, {"error": 'expected {"query": "..."}'})
        return
    limit = body.get("limit") or 0
    if limit <= 0:
        limit = 3
    results = [{"rank": i + 1, "title": f"result {i + 1} for {json.dumps(query)}"} for i in range(limit)]
    write_json(handler, 200, {"query": query, "results": results})


def build_schema():
    """A small SaaS-flavored schema: users, plans, sessions, a search union,
    and an event sink whose payload argument is a JSON string."""
    plan_type = GraphQLObjectType("Plan", {
        "name": GraphQLField(GraphQLNonNull(GraphQLString)),
        "price": GraphQLField(GraphQLNonNull(GraphQLInt)),
    })
    user_type = GraphQLObjectType("User", {
        "id": GraphQLField(GraphQLNonNull(GraphQLString)),
        "email": GraphQLField(GraphQLNonNull(GraphQLString)),
        "plan": GraphQLField(GraphQLString),
        "tags": GraphQLField(GraphQLList(GraphQLString)),
    })
    session_type = GraphQLObjectType("Session", {
        "userId": GraphQLField(GraphQLNonNull(GraphQLString)),
        "expiresAt": GraphQLField(GraphQLNonNull(GraphQLString)),
        "requestId": GraphQLField(GraphQLString),
    })
    event_type = GraphQLObjectType("Event", {
        "accepted": GraphQLField(GraphQLNonNull(GraphQLBoolean)),
        "action": GraphQLField(GraphQLString),
    })
    search_result_type = GraphQLUnionType(
        "SearchResult",
        [user_type, plan_type],
        resolve_type=lambda value, *_: "User" if "email" in value else "Plan",
    )
    create_user_input = GraphQLInputObjectType("CreateUserInput", {
        "email": GraphQLInputField(GraphQLNonNull(GraphQLString)),
        "plan": GraphQLInputField(GraphQLString),
        "tags": GraphQLInputField(GraphQLList(GraphQLString)),
    })

    plans = [
        {"name": "free", "price": 0},
        {"name": "pro", "price": 49},
        {"name": "enterprise", "price": 499},
    ]

    # Responses derive deterministically from inputs so recorded and replayed
    # traffic stay comparable; the volatility in this demo lives in the
    # REQUESTS (tokens, emails, request ids), which is where transforms work.
    def user_by_id(user_id):
        return {
            "id": user_id,
            "email": f"{user_id}@example.com",
            "plan": plans[len(user_id) % len(plans)]["name"],
            "tags": ["seed"],
        }

    def resolve_search(_, info, q):
        return [user_by_id(f"u-{q}")] + [p for p in plans if q in p["name"]]

    # session VERIFIES the JWT: bad signature or an expired token is a
    # GraphQL error. This is what makes token transforms provable: stale
    # recordings fail here until jwt_resign fixes the variable.
    def resolve_session(_, info, token, requestId=None):
        claims = verify_jwt(token)
        session = {
            "userId": claims["sub"],
            "expiresAt": datetime.fromtimestamp(claims["exp"], timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        if isinstance(requestId, str):
            session["requestId"] = requestId
        return session

    def resolve_create_user(_, info, input):
        email = input["email"]
        return {
            "id": "u-" + hashlib.sha256(email.encode()).hexdigest()[:8],
            "email": email,
            "plan": input.get("plan"),
            "tags": input.get("tags"),
        }

    # trackEvent's payload is a JSON document serialized into a string
    # argument, the case that needs graphql -> json_path chaining. The server
    # parses it to prove it is real JSON.
    def resolve_track_event(_, info, payload):
        try:
            parsed = json.loads(payload)
        except ValueError as err:
            raise GraphQLError(f"payload is not valid JSON: {err}") from err
        return {"accepted": True, "action": parsed.get("action")}

    query_type = GraphQLObjectType("Query", {
        "user": GraphQLField(
            user_type,
            args={"id": GraphQLArgument(GraphQLNonNull(GraphQLString))},
            resolve=lambda _, info, id: user_by_id(id),
        ),
        "plans": GraphQLField(GraphQLList(plan_type), resolve=lambda *_: plans),
        "search": GraphQLField(
            GraphQLList(search_result_type),
            args={"q": GraphQLArgument(GraphQLNonNull(GraphQLString))},
            resolve=resolve_search,
        ),
        "session": GraphQLField(
            session_type,
            args={
                "token": GraphQLArgument(GraphQLNonNull(GraphQLString)),
                "requestId": GraphQLArgument(GraphQLString),
            },
            resolve=resolve_session,
        ),
    })
    mutation_type = GraphQLObjectType("Mutation", {
        "createUser": GraphQLField(
            user_type,
            args={"input": GraphQLArgument(GraphQLNonNull(create_user_input))},
            resolve=resolve_create_user,
        ),
        "trackEvent": GraphQLField(
            event_type,
            args={"payload": GraphQLArgument(GraphQLNonNull(GraphQLString))},
            resolve=resolve_track_event,
        ),
    })
    return GraphQLSchema(query=query_type, mutation=mutation_type)


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

# The GraphQL documents the driver sends. Fixed text, so recordings are
# stable; the per-run values ride in variables (and one inline literal).
DOC_SESSION = """query Session($token: String!, $requestId: String!) {
  session(token: $token, requestId: $requestId) {
    userId
    expiresAt
    requestId
  }
}"""

DOC_CREATE_USER = """mutation CreateUser($email: String!) {
  createUser(input: {email: $email, plan: "pro", tags: ["beta", "early-access"]}) {
    id
    email
    plan
    __typename
  }
}"""

DOC_DASHBOARD = """query Dashboard {
  me: user(id: "u-1") {
    ...UserFields
  }
  teammate: user(id: "u-2") {
    ...UserFields
  }
}

fragment UserFields on User {
  id
  email
  plan
  __typename
}"""

DOC_FIND = """query Find($q: String!) {
  search(q: $q) {
    __typename
    ... on User {
      id
      email
    }
    ... on Plan {
      name
      price
    }
  }
}"""

DOC_MULTI_OP = """query GetPlans {
  plans {
    name
    price
  }
}

query GetUser {
  user(id: "u-1") {
    id
    email
  }
}"""

DOC_TRACK = r"""mutation Track {
  trackEvent(payload: "{\"action\":\"login\",\"attempt\":3,\"client\":{\"os\":\"macos\",\"version\":\"2.1.0\"}}") {
    accepted
    action
  }
}"""


class DriverError(Exception):
    pass


def run_driver(target, loop, interval):
    pass_number = 0
    while True:
        pass_number += 1
        try:
            drive_pass(target, pass_number)
        except DriverError as err:
            log.info("pass %d: %s", pass_number, err)
            sys.exit(1)
        if not loop:
            return
        time.sleep(interval)


def gql_request(query="", operation_name="", variables=None, extensions=None):
    """The same envelope the Go driver sends, including the null fields, so
    recordings from either driver are interchangeable."""
    return {"query": query, "operationName": operation_name, "variables": variables, "extensions": extensions}


def drive_pass(target, pass_number):
    request_id = secrets.token_hex(16)
    email = f"user-{secrets.token_hex(4)}@example.com"
    token = sign_jwt(f"u-{secrets.token_hex(4)}", TOKEN_TTL_SECONDS)

    cases = [
        ("Session", gql_request(DOC_SESSION, "Session", {"requestId": request_id, "token": token})),
        ("CreateUser", gql_request(DOC_CREATE_USER, "CreateUser", {"email": email})),
        ("Dashboard", gql_request(DOC_DASHBOARD, "Dashboard")),
        ("Find", gql_request(DOC_FIND, "Find", {"q": "pro"})),
        ("GetPlans", gql_request(DOC_MULTI_OP, "GetPlans")),
        ("GetUser", gql_request(DOC_MULTI_OP, "GetUser")),
        ("Track", gql_request(DOC_TRACK, "Track")),
    ]
    for name, req in cases:
        post_graphql(target, name, req, want_errors=False)

    # Negative case: APQ hash with no query text. The expected answer is the
    # PersistedQueryNotFound error, so errors are required here.
    apq = gql_request(extensions={
        "persistedQuery": {"sha256Hash": hashlib.sha256(DOC_SESSION.encode()).hexdigest(), "version": 1},
    })
    post_graphql(target, "APQ", apq, want_errors=True)

    # Negative case: REST search whose body merely looks GraphQL-ish.
    post_rest_search(target)

    log.info("pass %d complete: 7 GraphQL operations + APQ + REST negative", pass_number)


def post(url, body):
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, resp.read()
    except urllib.error.HTTPError as err:
        return err.code, err.read()
    except urllib.error.URLError as err:
        raise DriverError(str(err.reason)) from err


def post_graphql(target, name, req, want_errors):
    try:
        _, raw = post(target + "/graphql", json.dumps(req, separators=(",", ":")).encode())
    except DriverError as err:
        raise DriverError(f"{name}: {err}") from err
    try:
        out = json.loads(raw)
    except ValueError as err:
        raise DriverError(f"{name}: decoding response: {err}") from err
    errors = out.get("errors") or []
    if want_errors:
        if not errors:
            raise DriverError(f"{name}: expected a GraphQL error, got none")
        log.info("%-10s ok (expected error: %s)", name, errors[0].get("message"))
        return
    if errors:
        raise DriverError(f"{name}: unexpected errors: {errors}")
    log.info("%-10s ok", name)


def post_rest_search(target):
    try:
        status, _ = post(target + "/api/search", b'{"query": "error rates by service", "limit": 2}')
    except DriverError as err:
        raise DriverError(f"rest search: {err}") from err
    if status != 200:
        raise DriverError(f"rest search: status {status}")
    log.info("%-10s ok", "RESTSearch")


# ---------------------------------------------------------------------------
# Minimal HS256 JWT: no dependency, fixed demo secret
# ---------------------------------------------------------------------------


def sign_jwt(sub, ttl_seconds):
    now = int(time.time())
    header = b64url(b'{"alg":"HS256","typ":"JWT"}')
    claims = b64url(json.dumps({"exp": now + ttl_seconds, "iat": now, "sub": sub}, separators=(",", ":")).encode())
    signing_input = f"{header}.{claims}"
    signature = hmac.new(JWT_SECRET, signing_input.encode(), hashlib.sha256).digest()
    return f"{signing_input}.{b64url(signature)}"


def verify_jwt(token):
    parts = token.split(".")
    if len(parts) != 3:
        raise GraphQLError("token is not a JWT")
    want = b64url(hmac.new(JWT_SECRET, f"{parts[0]}.{parts[1]}".encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(want, parts[2]):
        raise GraphQLError("token signature invalid")
    try:
        claims = json.loads(base64.urlsafe_b64decode(parts[1] + "=" * (-len(parts[1]) % 4)))
    except ValueError as err:
        raise GraphQLError("token claims not JSON") from err
    exp = claims.get("exp")
    if not isinstance(exp, (int, float)) or int(time.time()) > exp:
        raise GraphQLError("token expired")
    return claims


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def read_body(handler):
    length = int(handler.headers.get("Content-Length") or 0)
    return handler.rfile.read(length)


def write_json(handler, status, payload):
    body = (json.dumps(payload) + "\n").encode()
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def b64url(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


if __name__ == "__main__":
    main()
