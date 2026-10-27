// GraphQL demo, Java edition. The same API and driver as the Go version in the
// parent directory: same schema, same resolvers, and a driver that sends
// byte-for-byte the same requests, so every proxymock walkthrough runs
// unchanged against either one.
//
// The server is built on graphql-java with the schema defined in code. It
// parses and validates every incoming query, so a transform that mangles a
// query produces a visible GraphQL error on replay.
//
// Run the server:            java -jar target/graphql-demo.jar
// Exercise it once:          java -jar target/graphql-demo.jar -drive
// Continuous traffic:        java -jar target/graphql-demo.jar -drive -loop
// Through proxymock (:4143): java -jar target/graphql-demo.jar -drive -target http://localhost:4143
package com.speedscale.demo.graphql;

import static graphql.Scalars.GraphQLBoolean;
import static graphql.Scalars.GraphQLInt;
import static graphql.Scalars.GraphQLString;
import static graphql.schema.GraphQLArgument.newArgument;
import static graphql.schema.GraphQLFieldDefinition.newFieldDefinition;
import static graphql.schema.GraphQLInputObjectField.newInputObjectField;
import static graphql.schema.GraphQLList.list;
import static graphql.schema.GraphQLNonNull.nonNull;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import graphql.ExecutionInput;
import graphql.ExecutionResult;
import graphql.GraphQL;
import graphql.GraphQLError;
import graphql.GraphqlErrorBuilder;
import graphql.execution.DataFetcherResult;
import graphql.schema.DataFetcher;
import graphql.schema.DataFetchingEnvironment;
import graphql.schema.FieldCoordinates;
import graphql.schema.GraphQLCodeRegistry;
import graphql.schema.GraphQLInputObjectType;
import graphql.schema.GraphQLObjectType;
import graphql.schema.GraphQLSchema;
import graphql.schema.GraphQLUnionType;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

public final class GraphQLDemo {

    // JWT_SECRET signs and verifies the demo session tokens. It is deliberately
    // a fixed, published value so a jwt_resign transform can be configured
    // against it without any secret management.
    private static final String JWT_SECRET = "speedscale-demo-secret";

    // TOKEN_TTL_SECONDS keeps recorded sessions short-lived on purpose: replay
    // a recording more than five minutes after capture and the Session query
    // fails with "token expired" until a transform regenerates or re-signs the
    // token.
    private static final long TOKEN_TTL_SECONDS = 5 * 60;

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final SecureRandom RANDOM = new SecureRandom();

    // Go's log package format (2006/01/02 15:04:05), so driver output reads
    // the same in every language.
    private static final DateTimeFormatter LOG_TIME = DateTimeFormatter.ofPattern("yyyy/MM/dd HH:mm:ss");

    private GraphQLDemo() {}

    public static void main(String[] args) throws Exception {
        // The Go version's flags (-drive, -target URL, -loop, -interval 2s),
        // so the two are interchangeable in scripts and docs.
        boolean drive = false;
        boolean loop = false;
        String target = "http://localhost:8080";
        long intervalMillis = 2000;
        for (int i = 0; i < args.length; i++) {
            switch (args[i].replaceFirst("^--?", "")) {
                case "drive" -> drive = true;
                case "loop" -> loop = true;
                case "target" -> target = args[++i];
                case "interval" -> intervalMillis = Long.parseLong(args[++i].replace("s", "")) * 1000;
                default -> fatal("unknown flag " + args[i]);
            }
        }
        if (drive) {
            runDriver(target, loop, intervalMillis);
            return;
        }
        runServer();
    }

    // -------------------------------------------------------------------------
    // Server
    // -------------------------------------------------------------------------

    private static void runServer() throws IOException {
        GraphQL graphQL = GraphQL.newGraphQL(buildSchema()).build();
        String port = System.getenv().getOrDefault("PORT", "8080");
        HttpServer server = HttpServer.create(new InetSocketAddress(Integer.parseInt(port)), 0);
        server.createContext("/", exchange -> {
            try (exchange) {
                String method = exchange.getRequestMethod();
                String path = exchange.getRequestURI().getPath();
                if (method.equals("POST") && path.equals("/graphql")) {
                    handleGraphQL(graphQL, exchange);
                } else if (method.equals("POST") && path.equals("/api/search")) {
                    handleRESTSearch(exchange);
                } else if (method.equals("GET") && path.equals("/health")) {
                    writeJSON(exchange, 200, Map.of("status", "ok"));
                } else {
                    writeJSON(exchange, 404, Map.of("error", "not found"));
                }
            }
        });
        server.setExecutor(Executors.newCachedThreadPool());
        server.start();
        log("graphql-demo serving on :%s (POST /graphql)", port);
    }

    private static void handleGraphQL(GraphQL graphQL, HttpExchange exchange) throws IOException {
        Map<String, Object> body;
        try {
            body = JSON.readValue(exchange.getRequestBody(), new TypeReference<>() {});
        } catch (IOException e) {
            writeJSON(exchange, 400, Map.of("errors", List.of(Map.of("message", "body is not valid JSON"))));
            return;
        }

        // APQ negative case: hash but no query text. Real servers answer
        // PersistedQueryNotFound on a cache miss; so does this one. The point
        // for Speedscale is that there is no query text to convert or edit.
        String query = body.get("query") instanceof String s ? s : "";
        if (query.isEmpty()) {
            if (body.get("extensions") instanceof Map<?, ?> ext && ext.containsKey("persistedQuery")) {
                writeJSON(exchange, 200, Map.of("errors", List.of(Map.of(
                        "message", "PersistedQueryNotFound",
                        "extensions", Map.of("code", "PERSISTED_QUERY_NOT_FOUND")))));
                return;
            }
            writeJSON(exchange, 400, Map.of("errors", List.of(Map.of("message", "no query provided"))));
            return;
        }

        String operationName = body.get("operationName") instanceof String s && !s.isEmpty() ? s : null;
        @SuppressWarnings("unchecked")
        Map<String, Object> variables = body.get("variables") instanceof Map<?, ?> m
                ? (Map<String, Object>) m
                : Map.of();
        ExecutionResult result = graphQL.execute(ExecutionInput.newExecutionInput()
                .query(query)
                .operationName(operationName)
                .variables(variables)
                .build());
        String op = operationName == null ? "" : operationName;
        if (!result.getErrors().isEmpty()) {
            List<String> messages = result.getErrors().stream().map(GraphQLError::getMessage).toList();
            log("graphql op=\"%s\" errors=%s", op, String.join("; ", messages));
        } else {
            log("graphql op=\"%s\" ok", op);
        }
        // Per GraphQL-over-HTTP convention, execution and validation errors
        // ride in the 200 envelope's errors array.
        writeJSON(exchange, 200, result.toSpecification());
    }

    // handleRESTSearch is the fake-GraphQL negative case: a plain REST endpoint
    // whose body happens to have a top-level "query" key. It lives at
    // /api/search so URL-suffix GraphQL detection must ignore it.
    private static void handleRESTSearch(HttpExchange exchange) throws IOException {
        Map<String, Object> body;
        try {
            body = JSON.readValue(exchange.getRequestBody(), new TypeReference<>() {});
        } catch (IOException e) {
            body = Map.of();
        }
        String query = body.get("query") instanceof String s ? s : "";
        if (query.isEmpty()) {
            writeJSON(exchange, 400, Map.of("error", "expected {\"query\": \"...\"}"));
            return;
        }
        int limit = body.get("limit") instanceof Integer n && n > 0 ? n : 3;
        List<Map<String, Object>> results = new ArrayList<>();
        for (int i = 0; i < limit; i++) {
            results.add(ordered("rank", i + 1, "title", "result " + (i + 1) + " for " + JSON.writeValueAsString(query)));
        }
        writeJSON(exchange, 200, ordered("query", query, "results", results));
    }

    // buildSchema defines a small SaaS-flavored schema: users, plans,
    // sessions, a search union, and an event sink whose payload argument is a
    // JSON string.
    static GraphQLSchema buildSchema() {
        GraphQLObjectType planType = GraphQLObjectType.newObject().name("Plan")
                .field(newFieldDefinition().name("name").type(nonNull(GraphQLString)))
                .field(newFieldDefinition().name("price").type(nonNull(GraphQLInt)))
                .build();
        GraphQLObjectType userType = GraphQLObjectType.newObject().name("User")
                .field(newFieldDefinition().name("id").type(nonNull(GraphQLString)))
                .field(newFieldDefinition().name("email").type(nonNull(GraphQLString)))
                .field(newFieldDefinition().name("plan").type(GraphQLString))
                .field(newFieldDefinition().name("tags").type(list(GraphQLString)))
                .build();
        GraphQLObjectType sessionType = GraphQLObjectType.newObject().name("Session")
                .field(newFieldDefinition().name("userId").type(nonNull(GraphQLString)))
                .field(newFieldDefinition().name("expiresAt").type(nonNull(GraphQLString)))
                .field(newFieldDefinition().name("requestId").type(GraphQLString))
                .build();
        GraphQLObjectType eventType = GraphQLObjectType.newObject().name("Event")
                .field(newFieldDefinition().name("accepted").type(nonNull(GraphQLBoolean)))
                .field(newFieldDefinition().name("action").type(GraphQLString))
                .build();
        GraphQLUnionType searchResultType = GraphQLUnionType.newUnionType().name("SearchResult")
                .possibleTypes(userType, planType)
                .build();
        GraphQLInputObjectType createUserInput = GraphQLInputObjectType.newInputObject().name("CreateUserInput")
                .field(newInputObjectField().name("email").type(nonNull(GraphQLString)))
                .field(newInputObjectField().name("plan").type(GraphQLString))
                .field(newInputObjectField().name("tags").type(list(GraphQLString)))
                .build();

        List<Map<String, Object>> plans = List.of(
                ordered("name", "free", "price", 0),
                ordered("name", "pro", "price", 49),
                ordered("name", "enterprise", "price", 499));

        GraphQLObjectType queryType = GraphQLObjectType.newObject().name("Query")
                .field(newFieldDefinition().name("user").type(userType)
                        .argument(newArgument().name("id").type(nonNull(GraphQLString))))
                .field(newFieldDefinition().name("plans").type(list(planType)))
                .field(newFieldDefinition().name("search").type(list(searchResultType))
                        .argument(newArgument().name("q").type(nonNull(GraphQLString))))
                .field(newFieldDefinition().name("session").type(sessionType)
                        .argument(newArgument().name("token").type(nonNull(GraphQLString)))
                        .argument(newArgument().name("requestId").type(GraphQLString)))
                .build();
        GraphQLObjectType mutationType = GraphQLObjectType.newObject().name("Mutation")
                .field(newFieldDefinition().name("createUser").type(userType)
                        .argument(newArgument().name("input").type(nonNull(createUserInput))))
                .field(newFieldDefinition().name("trackEvent").type(eventType)
                        .argument(newArgument().name("payload").type(nonNull(GraphQLString))))
                .build();

        GraphQLCodeRegistry codeRegistry = GraphQLCodeRegistry.newCodeRegistry()
                .typeResolver("SearchResult", env -> {
                    Map<?, ?> value = env.getObject();
                    return env.getSchema().getObjectType(value.containsKey("email") ? "User" : "Plan");
                })
                .dataFetcher(FieldCoordinates.coordinates("Query", "user"),
                        (DataFetcher<?>) env -> userByID(env.getArgument("id"), plans))
                .dataFetcher(FieldCoordinates.coordinates("Query", "plans"), (DataFetcher<?>) env -> plans)
                .dataFetcher(FieldCoordinates.coordinates("Query", "search"), (DataFetcher<?>) env -> {
                    String q = env.getArgument("q");
                    List<Map<String, Object>> out = new ArrayList<>();
                    out.add(userByID("u-" + q, plans));
                    for (Map<String, Object> plan : plans) {
                        if (((String) plan.get("name")).contains(q)) {
                            out.add(plan);
                        }
                    }
                    return out;
                })
                .dataFetcher(FieldCoordinates.coordinates("Query", "session"), GraphQLDemo::resolveSession)
                .dataFetcher(FieldCoordinates.coordinates("Mutation", "createUser"), (DataFetcher<?>) env -> {
                    Map<String, Object> input = env.getArgument("input");
                    String email = (String) input.get("email");
                    Map<String, Object> user = new LinkedHashMap<>();
                    user.put("id", "u-" + sha256Hex(email).substring(0, 8));
                    user.put("email", email);
                    user.put("plan", input.get("plan"));
                    user.put("tags", input.get("tags"));
                    return user;
                })
                .dataFetcher(FieldCoordinates.coordinates("Mutation", "trackEvent"), GraphQLDemo::resolveTrackEvent)
                .build();

        return GraphQLSchema.newSchema()
                .query(queryType)
                .mutation(mutationType)
                .codeRegistry(codeRegistry)
                .build();
    }

    // Responses derive deterministically from inputs so recorded and replayed
    // traffic stay comparable; the volatility in this demo lives in the
    // REQUESTS (tokens, emails, request ids), which is where transforms work.
    private static Map<String, Object> userByID(String id, List<Map<String, Object>> plans) {
        Map<String, Object> user = new LinkedHashMap<>();
        user.put("id", id);
        user.put("email", id + "@example.com");
        user.put("plan", plans.get(id.length() % plans.size()).get("name"));
        user.put("tags", List.of("seed"));
        return user;
    }

    // resolveSession VERIFIES the JWT: bad signature or an expired token is a
    // GraphQL error. This is what makes token transforms provable: stale
    // recordings fail here until jwt_resign fixes the variable. The error is
    // returned rather than thrown so its message is exactly "token expired",
    // not graphql-java's "Exception while fetching data" wrapper.
    private static DataFetcherResult<Object> resolveSession(DataFetchingEnvironment env) {
        Map<String, Object> claims;
        try {
            claims = verifyJWT(env.getArgument("token"));
        } catch (IllegalArgumentException e) {
            return DataFetcherResult.newResult().error(fieldError(env, e.getMessage())).build();
        }
        long exp = ((Number) claims.get("exp")).longValue();
        Map<String, Object> session = new LinkedHashMap<>();
        session.put("userId", claims.get("sub"));
        session.put("expiresAt", DateTimeFormatter.ISO_INSTANT.format(Instant.ofEpochSecond(exp)));
        if (env.getArgument("requestId") instanceof String requestId) {
            session.put("requestId", requestId);
        }
        return DataFetcherResult.newResult().data(session).build();
    }

    // resolveTrackEvent's payload is a JSON document serialized into a string
    // argument, the case that needs graphql -> json_path chaining. The server
    // parses it to prove it is real JSON.
    private static DataFetcherResult<Object> resolveTrackEvent(DataFetchingEnvironment env) {
        Map<String, Object> payload;
        try {
            payload = JSON.readValue((String) env.getArgument("payload"), new TypeReference<>() {});
        } catch (JsonProcessingException e) {
            return DataFetcherResult.newResult()
                    .error(fieldError(env, "payload is not valid JSON: " + e.getOriginalMessage()))
                    .build();
        }
        Map<String, Object> event = new LinkedHashMap<>();
        event.put("accepted", true);
        event.put("action", payload.get("action"));
        return DataFetcherResult.newResult().data(event).build();
    }

    private static GraphQLError fieldError(DataFetchingEnvironment env, String message) {
        return GraphqlErrorBuilder.newError(env).message(message).build();
    }

    // -------------------------------------------------------------------------
    // Driver
    // -------------------------------------------------------------------------

    // The GraphQL documents the driver sends. Fixed text, so recordings are
    // stable; the per-run values ride in variables (and one inline literal).
    private static final String DOC_SESSION = """
            query Session($token: String!, $requestId: String!) {
              session(token: $token, requestId: $requestId) {
                userId
                expiresAt
                requestId
              }
            }""";

    private static final String DOC_CREATE_USER = """
            mutation CreateUser($email: String!) {
              createUser(input: {email: $email, plan: "pro", tags: ["beta", "early-access"]}) {
                id
                email
                plan
                __typename
              }
            }""";

    private static final String DOC_DASHBOARD = """
            query Dashboard {
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
            }""";

    private static final String DOC_FIND = """
            query Find($q: String!) {
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
            }""";

    private static final String DOC_MULTI_OP = """
            query GetPlans {
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
            }""";

    private static final String DOC_TRACK = """
            mutation Track {
              trackEvent(payload: "{\\"action\\":\\"login\\",\\"attempt\\":3,\\"client\\":{\\"os\\":\\"macos\\",\\"version\\":\\"2.1.0\\"}}") {
                accepted
                action
              }
            }""";

    private static final HttpClient HTTP = HttpClient.newHttpClient();

    private static void runDriver(String target, boolean loop, long intervalMillis) throws InterruptedException {
        for (int pass = 1; ; pass++) {
            try {
                drivePass(target, pass);
            } catch (DriverException e) {
                fatal("pass " + pass + ": " + e.getMessage());
            }
            if (!loop) {
                return;
            }
            Thread.sleep(intervalMillis);
        }
    }

    // gqlRequest builds the same envelope the Go driver sends, including the
    // null fields, so recordings from either driver are interchangeable.
    private static Map<String, Object> gqlRequest(String query, String operationName, Map<String, Object> variables,
            Map<String, Object> extensions) {
        return ordered("query", query, "operationName", operationName, "variables", variables, "extensions", extensions);
    }

    private static void drivePass(String target, int pass) throws DriverException, InterruptedException {
        String requestId = randomHex(16);
        String email = "user-" + randomHex(4) + "@example.com";
        String token = signJWT("u-" + randomHex(4), TOKEN_TTL_SECONDS);

        List<Map.Entry<String, Map<String, Object>>> cases = List.of(
                Map.entry("Session", gqlRequest(DOC_SESSION, "Session", ordered("requestId", requestId, "token", token), null)),
                Map.entry("CreateUser", gqlRequest(DOC_CREATE_USER, "CreateUser", ordered("email", email), null)),
                Map.entry("Dashboard", gqlRequest(DOC_DASHBOARD, "Dashboard", null, null)),
                Map.entry("Find", gqlRequest(DOC_FIND, "Find", ordered("q", "pro"), null)),
                Map.entry("GetPlans", gqlRequest(DOC_MULTI_OP, "GetPlans", null, null)),
                Map.entry("GetUser", gqlRequest(DOC_MULTI_OP, "GetUser", null, null)),
                Map.entry("Track", gqlRequest(DOC_TRACK, "Track", null, null)));
        for (Map.Entry<String, Map<String, Object>> c : cases) {
            postGraphQL(target, c.getKey(), c.getValue(), false);
        }

        // Negative case: APQ hash with no query text. The expected answer is
        // the PersistedQueryNotFound error, so errors are required here.
        Map<String, Object> apq = gqlRequest("", "", null,
                ordered("persistedQuery", ordered("sha256Hash", sha256Hex(DOC_SESSION), "version", 1)));
        postGraphQL(target, "APQ", apq, true);

        // Negative case: REST search whose body merely looks GraphQL-ish.
        postRESTSearch(target);

        log("pass %d complete: 7 GraphQL operations + APQ + REST negative", pass);
    }

    private static HttpResponse<String> post(String url, String body) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                .header("Content-Type", "application/json")
                .POST(HttpRequest.BodyPublishers.ofString(body))
                .build();
        return HTTP.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private static void postGraphQL(String target, String name, Map<String, Object> req, boolean wantErrors)
            throws DriverException, InterruptedException {
        HttpResponse<String> resp;
        try {
            resp = post(target + "/graphql", JSON.writeValueAsString(req));
        } catch (IOException e) {
            throw new DriverException(name + ": " + describe(e));
        }
        Map<String, Object> out;
        try {
            out = JSON.readValue(resp.body(), new TypeReference<>() {});
        } catch (JsonProcessingException e) {
            throw new DriverException(name + ": decoding response: " + e.getOriginalMessage());
        }
        List<?> errors = out.get("errors") instanceof List<?> l ? l : List.of();
        if (wantErrors) {
            if (errors.isEmpty()) {
                throw new DriverException(name + ": expected a GraphQL error, got none");
            }
            log("%-10s ok (expected error: %s)", name, ((Map<?, ?>) errors.get(0)).get("message"));
            return;
        }
        if (!errors.isEmpty()) {
            throw new DriverException(name + ": unexpected errors: " + errors);
        }
        log("%-10s ok", name);
    }

    private static void postRESTSearch(String target) throws DriverException, InterruptedException {
        HttpResponse<String> resp;
        try {
            resp = post(target + "/api/search", "{\"query\": \"error rates by service\", \"limit\": 2}");
        } catch (IOException e) {
            throw new DriverException("rest search: " + describe(e));
        }
        if (resp.statusCode() != 200) {
            throw new DriverException("rest search: status " + resp.statusCode());
        }
        log("%-10s ok", "RESTSearch");
    }

    private static final class DriverException extends Exception {
        DriverException(String message) {
            super(message);
        }
    }

    // -------------------------------------------------------------------------
    // Minimal HS256 JWT: no dependency, fixed demo secret
    // -------------------------------------------------------------------------

    private static String signJWT(String sub, long ttlSeconds) {
        long now = Instant.now().getEpochSecond();
        String header = b64url("{\"alg\":\"HS256\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
        String claims;
        try {
            claims = b64url(JSON.writeValueAsBytes(ordered("exp", now + ttlSeconds, "iat", now, "sub", sub)));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
        String signingInput = header + "." + claims;
        return signingInput + "." + b64url(hmac(signingInput));
    }

    private static Map<String, Object> verifyJWT(String token) {
        String[] parts = token.split("\\.");
        if (parts.length != 3) {
            throw new IllegalArgumentException("token is not a JWT");
        }
        byte[] want = b64url(hmac(parts[0] + "." + parts[1])).getBytes(StandardCharsets.UTF_8);
        if (!MessageDigest.isEqual(want, parts[2].getBytes(StandardCharsets.UTF_8))) {
            throw new IllegalArgumentException("token signature invalid");
        }
        Map<String, Object> claims;
        try {
            claims = JSON.readValue(Base64.getUrlDecoder().decode(parts[1]), new TypeReference<>() {});
        } catch (IOException | IllegalArgumentException e) {
            throw new IllegalArgumentException("token claims not JSON");
        }
        if (!(claims.get("exp") instanceof Number exp) || Instant.now().getEpochSecond() > exp.longValue()) {
            throw new IllegalArgumentException("token expired");
        }
        return claims;
    }

    private static byte[] hmac(String input) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(JWT_SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return mac.doFinal(input.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private static void writeJSON(HttpExchange exchange, int status, Object payload) throws IOException {
        byte[] body = (JSON.writeValueAsString(payload) + "\n").getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, body.length);
        try (OutputStream out = exchange.getResponseBody()) {
            out.write(body);
        }
    }

    // ordered builds a map that keeps insertion order and allows null values,
    // which Map.of does not.
    private static Map<String, Object> ordered(Object... keysAndValues) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i < keysAndValues.length; i += 2) {
            map.put((String) keysAndValues[i], keysAndValues[i + 1]);
        }
        return map;
    }

    private static String sha256Hex(String s) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    private static String b64url(byte[] raw) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    }

    private static String randomHex(int n) {
        byte[] b = new byte[n];
        RANDOM.nextBytes(b);
        return HexFormat.of().formatHex(b);
    }

    private static String describe(IOException e) {
        return e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
    }

    private static void log(String format, Object... args) {
        System.out.println(LocalDateTime.now().format(LOG_TIME) + " " + String.format(format, args));
    }

    private static void fatal(String message) {
        log("%s", message);
        System.exit(1);
    }
}
