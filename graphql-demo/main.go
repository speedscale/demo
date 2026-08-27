// GraphQL demo — a small GraphQL API plus a driver that exercises every
// document shape Speedscale's transform system has to address: variables,
// inline arguments with nested input objects and lists, aliases, named and
// inline fragments over a union, a multi-operation document selected by
// operationName, a JSON string embedded in an argument, and __typename noise.
//
// The server is built on github.com/graphql-go/graphql — the same library
// Speedscale uses to convert GraphQL bodies for the transform system — so it
// parses and VALIDATES every incoming query. A transform that mangles a query
// produces a visible GraphQL error on replay; the server acts as a
// correctness oracle, not just a traffic sink.
//
// What each driver case is built to prove:
//
//	Session     variables carry the dynamic data: a signed HS256 JWT
//	            (verified server-side, 5 minute expiry) and a per-request
//	            rotating id. Replaying a stale recording fails until a
//	            jwt_resign / smart_replace transform fixes the token.
//	CreateUser  nested input object with an inline literal (plan: "pro"),
//	            a list argument, and a rotating email variable.
//	Dashboard   aliases (me / teammate) over a shared named fragment.
//	Find        union result with inline fragments and __typename noise.
//	GetPlans /  one document holding two operations; the request's
//	GetUser     operationName picks which one runs.
//	Track       a JSON document serialized INTO a string argument.
//	APQ         negative: a persisted-query request with a hash and no query
//	            text — there is no query to edit or render.
//	/api/search negative: a REST body {"query": "..."} that merely looks
//	            GraphQL-ish and must not be treated as GraphQL.
//
// Run the server:            ./graphql-demo
// Exercise it once:          ./graphql-demo -drive
// Continuous traffic:        ./graphql-demo -drive -loop
// Through proxymock (:4143): ./graphql-demo -drive -target http://localhost:4143
package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/graphql-go/graphql"
)

// jwtSecret signs and verifies the demo session tokens. It is deliberately a
// fixed, published value so a jwt_resign transform can be configured against
// it without any secret management.
const jwtSecret = "speedscale-demo-secret"

// tokenTTL keeps recorded sessions short-lived on purpose: replay a recording
// more than five minutes after capture and the Session query fails with
// "token expired" until a transform regenerates or re-signs the token.
const tokenTTL = 5 * time.Minute

func main() {
	drive := flag.Bool("drive", false, "exercise the API instead of serving it")
	target := flag.String("target", "http://localhost:8080", "base URL the driver sends to (use proxymock's inbound proxy to record)")
	loop := flag.Bool("loop", false, "with -drive, keep sending traffic until interrupted")
	interval := flag.Duration("interval", 2*time.Second, "with -drive -loop, delay between passes")
	flag.Parse()

	if *drive {
		runDriver(*target, *loop, *interval)
		return
	}
	runServer()
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

func runServer() {
	schema, err := buildSchema()
	if err != nil {
		log.Fatalf("schema: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /graphql", func(w http.ResponseWriter, r *http.Request) {
		handleGraphQL(schema, w, r)
	})
	mux.HandleFunc("POST /api/search", handleRESTSearch)
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]any{"status": "ok"})
	})

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("graphql-demo serving on :%s (POST /graphql)", port)
	log.Fatal(http.ListenAndServe(":"+port, mux))
}

// gqlRequest is the standard GraphQL-over-HTTP envelope, plus the extensions
// field used by Apollo persisted queries (APQ).
type gqlRequest struct {
	Query         string         `json:"query"`
	OperationName string         `json:"operationName"`
	Variables     map[string]any `json:"variables"`
	Extensions    map[string]any `json:"extensions"`
}

func handleGraphQL(schema graphql.Schema, w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"errors": []map[string]any{{"message": "unreadable body"}}})
		return
	}
	var req gqlRequest
	if err := json.Unmarshal(body, &req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]any{"errors": []map[string]any{{"message": "body is not valid JSON"}}})
		return
	}

	// APQ negative case: hash but no query text. Real servers answer
	// PersistedQueryNotFound on a cache miss; so does this one. The point for
	// Speedscale is that there is no query text to convert or edit.
	if req.Query == "" {
		if _, ok := req.Extensions["persistedQuery"]; ok {
			writeJSON(w, http.StatusOK, map[string]any{
				"errors": []map[string]any{{"message": "PersistedQueryNotFound", "extensions": map[string]any{"code": "PERSISTED_QUERY_NOT_FOUND"}}},
			})
			return
		}
		writeJSON(w, http.StatusBadRequest, map[string]any{"errors": []map[string]any{{"message": "no query provided"}}})
		return
	}

	result := graphql.Do(graphql.Params{
		Schema:         schema,
		RequestString:  req.Query,
		VariableValues: req.Variables,
		OperationName:  req.OperationName,
	})
	if len(result.Errors) > 0 {
		log.Printf("graphql op=%q errors=%v", req.OperationName, result.Errors)
	} else {
		log.Printf("graphql op=%q ok", req.OperationName)
	}
	// Per GraphQL-over-HTTP convention, execution and validation errors ride
	// in the 200 envelope's errors array.
	writeJSON(w, http.StatusOK, result)
}

// handleRESTSearch is the fake-GraphQL negative case: a plain REST endpoint
// whose body happens to have a top-level "query" key. It lives at /api/search
// so URL-suffix GraphQL detection must ignore it.
func handleRESTSearch(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Query string `json:"query"`
		Limit int    `json:"limit"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Query == "" {
		writeJSON(w, http.StatusBadRequest, map[string]any{"error": "expected {\"query\": \"...\"}"})
		return
	}
	if req.Limit <= 0 {
		req.Limit = 3
	}
	results := make([]map[string]any, 0, req.Limit)
	for i := 0; i < req.Limit; i++ {
		results = append(results, map[string]any{
			"rank":  i + 1,
			"title": fmt.Sprintf("result %d for %q", i+1, req.Query),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"query": req.Query, "results": results})
}

// buildSchema defines a small SaaS-flavored schema: users, plans, sessions,
// a search union, and an event sink whose payload argument is a JSON string.
func buildSchema() (graphql.Schema, error) {
	planType := graphql.NewObject(graphql.ObjectConfig{
		Name: "Plan",
		Fields: graphql.Fields{
			"name":  &graphql.Field{Type: graphql.NewNonNull(graphql.String)},
			"price": &graphql.Field{Type: graphql.NewNonNull(graphql.Int)},
		},
	})
	userType := graphql.NewObject(graphql.ObjectConfig{
		Name: "User",
		Fields: graphql.Fields{
			"id":    &graphql.Field{Type: graphql.NewNonNull(graphql.String)},
			"email": &graphql.Field{Type: graphql.NewNonNull(graphql.String)},
			"plan":  &graphql.Field{Type: graphql.String},
			"tags":  &graphql.Field{Type: graphql.NewList(graphql.String)},
		},
	})
	sessionType := graphql.NewObject(graphql.ObjectConfig{
		Name: "Session",
		Fields: graphql.Fields{
			"userId":    &graphql.Field{Type: graphql.NewNonNull(graphql.String)},
			"expiresAt": &graphql.Field{Type: graphql.NewNonNull(graphql.String)},
			"requestId": &graphql.Field{Type: graphql.String},
		},
	})
	eventType := graphql.NewObject(graphql.ObjectConfig{
		Name: "Event",
		Fields: graphql.Fields{
			"accepted": &graphql.Field{Type: graphql.NewNonNull(graphql.Boolean)},
			"action":   &graphql.Field{Type: graphql.String},
		},
	})
	searchResultType := graphql.NewUnion(graphql.UnionConfig{
		Name:  "SearchResult",
		Types: []*graphql.Object{userType, planType},
		ResolveType: func(p graphql.ResolveTypeParams) *graphql.Object {
			if m, ok := p.Value.(map[string]any); ok {
				if _, isUser := m["email"]; isUser {
					return userType
				}
			}
			return planType
		},
	})
	createUserInput := graphql.NewInputObject(graphql.InputObjectConfig{
		Name: "CreateUserInput",
		Fields: graphql.InputObjectConfigFieldMap{
			"email": &graphql.InputObjectFieldConfig{Type: graphql.NewNonNull(graphql.String)},
			"plan":  &graphql.InputObjectFieldConfig{Type: graphql.String},
			"tags":  &graphql.InputObjectFieldConfig{Type: graphql.NewList(graphql.String)},
		},
	})

	plans := []map[string]any{
		{"name": "free", "price": 0},
		{"name": "pro", "price": 49},
		{"name": "enterprise", "price": 499},
	}
	// Responses derive deterministically from inputs so recorded and replayed
	// traffic stay comparable; the volatility in this demo lives in the
	// REQUESTS (tokens, emails, request ids), which is where transforms work.
	userByID := func(id string) map[string]any {
		return map[string]any{
			"id":    id,
			"email": fmt.Sprintf("%s@example.com", id),
			"plan":  plans[len(id)%len(plans)]["name"],
			"tags":  []string{"seed"},
		}
	}

	queryType := graphql.NewObject(graphql.ObjectConfig{
		Name: "Query",
		Fields: graphql.Fields{
			"user": &graphql.Field{
				Type: userType,
				Args: graphql.FieldConfigArgument{
					"id": &graphql.ArgumentConfig{Type: graphql.NewNonNull(graphql.String)},
				},
				Resolve: func(p graphql.ResolveParams) (any, error) {
					return userByID(p.Args["id"].(string)), nil
				},
			},
			"plans": &graphql.Field{
				Type: graphql.NewList(planType),
				Resolve: func(p graphql.ResolveParams) (any, error) {
					return plans, nil
				},
			},
			"search": &graphql.Field{
				Type: graphql.NewList(searchResultType),
				Args: graphql.FieldConfigArgument{
					"q": &graphql.ArgumentConfig{Type: graphql.NewNonNull(graphql.String)},
				},
				Resolve: func(p graphql.ResolveParams) (any, error) {
					q := p.Args["q"].(string)
					out := []any{userByID("u-" + q)}
					for _, pl := range plans {
						if strings.Contains(pl["name"].(string), q) {
							out = append(out, pl)
						}
					}
					return out, nil
				},
			},
			// session VERIFIES the JWT: bad signature or an expired token is
			// a GraphQL error. This is what makes token transforms provable —
			// stale recordings fail here until jwt_resign fixes the variable.
			"session": &graphql.Field{
				Type: sessionType,
				Args: graphql.FieldConfigArgument{
					"token":     &graphql.ArgumentConfig{Type: graphql.NewNonNull(graphql.String)},
					"requestId": &graphql.ArgumentConfig{Type: graphql.String},
				},
				Resolve: func(p graphql.ResolveParams) (any, error) {
					claims, err := verifyJWT(p.Args["token"].(string))
					if err != nil {
						return nil, err
					}
					sess := map[string]any{
						"userId":    claims["sub"],
						"expiresAt": time.Unix(int64(claims["exp"].(float64)), 0).UTC().Format(time.RFC3339),
					}
					if rid, ok := p.Args["requestId"].(string); ok {
						sess["requestId"] = rid
					}
					return sess, nil
				},
			},
		},
	})

	mutationType := graphql.NewObject(graphql.ObjectConfig{
		Name: "Mutation",
		Fields: graphql.Fields{
			"createUser": &graphql.Field{
				Type: userType,
				Args: graphql.FieldConfigArgument{
					"input": &graphql.ArgumentConfig{Type: graphql.NewNonNull(createUserInput)},
				},
				Resolve: func(p graphql.ResolveParams) (any, error) {
					input := p.Args["input"].(map[string]any)
					email := input["email"].(string)
					sum := sha256.Sum256([]byte(email))
					u := map[string]any{
						"id":    "u-" + hex.EncodeToString(sum[:4]),
						"email": email,
						"plan":  input["plan"],
						"tags":  input["tags"],
					}
					return u, nil
				},
			},
			// trackEvent's payload is a JSON document serialized into a
			// string argument — the case that needs graphql → json_path
			// chaining. The server parses it to prove it is real JSON.
			"trackEvent": &graphql.Field{
				Type: eventType,
				Args: graphql.FieldConfigArgument{
					"payload": &graphql.ArgumentConfig{Type: graphql.NewNonNull(graphql.String)},
				},
				Resolve: func(p graphql.ResolveParams) (any, error) {
					var payload map[string]any
					if err := json.Unmarshal([]byte(p.Args["payload"].(string)), &payload); err != nil {
						return nil, fmt.Errorf("payload is not valid JSON: %w", err)
					}
					return map[string]any{"accepted": true, "action": payload["action"]}, nil
				},
			},
		},
	})

	return graphql.NewSchema(graphql.SchemaConfig{Query: queryType, Mutation: mutationType})
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

// docs are the GraphQL documents the driver sends. Fixed text, so recordings
// are stable; the per-run values ride in variables (and one inline literal).
const (
	docSession = `query Session($token: String!, $requestId: String!) {
  session(token: $token, requestId: $requestId) {
    userId
    expiresAt
    requestId
  }
}`

	docCreateUser = `mutation CreateUser($email: String!) {
  createUser(input: {email: $email, plan: "pro", tags: ["beta", "early-access"]}) {
    id
    email
    plan
    __typename
  }
}`

	docDashboard = `query Dashboard {
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
}`

	docFind = `query Find($q: String!) {
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
}`

	docMultiOp = `query GetPlans {
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
}`

	docTrack = `mutation Track {
  trackEvent(payload: "{\"action\":\"login\",\"attempt\":3,\"client\":{\"os\":\"macos\",\"version\":\"2.1.0\"}}") {
    accepted
    action
  }
}`
)

func runDriver(target string, loop bool, interval time.Duration) {
	pass := 0
	for {
		pass++
		if err := drivePass(target, pass); err != nil {
			log.Fatalf("pass %d: %v", pass, err)
		}
		if !loop {
			return
		}
		time.Sleep(interval)
	}
}

func drivePass(target string, pass int) error {
	requestID := randomHex(16)
	email := fmt.Sprintf("user-%s@example.com", randomHex(4))
	token := signJWT("u-"+randomHex(4), tokenTTL)

	cases := []struct {
		name string
		req  gqlRequest
	}{
		{"Session", gqlRequest{Query: docSession, OperationName: "Session", Variables: map[string]any{"token": token, "requestId": requestID}}},
		{"CreateUser", gqlRequest{Query: docCreateUser, OperationName: "CreateUser", Variables: map[string]any{"email": email}}},
		{"Dashboard", gqlRequest{Query: docDashboard, OperationName: "Dashboard"}},
		{"Find", gqlRequest{Query: docFind, OperationName: "Find", Variables: map[string]any{"q": "pro"}}},
		{"GetPlans", gqlRequest{Query: docMultiOp, OperationName: "GetPlans"}},
		{"GetUser", gqlRequest{Query: docMultiOp, OperationName: "GetUser"}},
		{"Track", gqlRequest{Query: docTrack, OperationName: "Track"}},
	}
	for _, c := range cases {
		if err := postGraphQL(target, c.name, c.req, false); err != nil {
			return err
		}
	}

	// Negative case: APQ hash with no query text. The expected answer is the
	// PersistedQueryNotFound error, so errors are required here.
	apq := gqlRequest{Extensions: map[string]any{
		"persistedQuery": map[string]any{"version": 1, "sha256Hash": sha256Hex(docSession)},
	}}
	if err := postGraphQL(target, "APQ", apq, true); err != nil {
		return err
	}

	// Negative case: REST search whose body merely looks GraphQL-ish.
	if err := postRESTSearch(target); err != nil {
		return err
	}

	log.Printf("pass %d complete: 7 GraphQL operations + APQ + REST negative", pass)
	return nil
}

func postGraphQL(target, name string, req gqlRequest, wantErrors bool) error {
	body, err := json.Marshal(req)
	if err != nil {
		return err
	}
	resp, err := http.Post(target+"/graphql", "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("%s: %w", name, err)
	}
	defer resp.Body.Close()
	var out struct {
		Data   json.RawMessage  `json:"data"`
		Errors []map[string]any `json:"errors"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return fmt.Errorf("%s: decoding response: %w", name, err)
	}
	if wantErrors {
		if len(out.Errors) == 0 {
			return fmt.Errorf("%s: expected a GraphQL error, got none", name)
		}
		log.Printf("%-10s ok (expected error: %v)", name, out.Errors[0]["message"])
		return nil
	}
	if len(out.Errors) > 0 {
		return fmt.Errorf("%s: unexpected errors: %v", name, out.Errors)
	}
	log.Printf("%-10s ok", name)
	return nil
}

func postRESTSearch(target string) error {
	body := []byte(`{"query": "error rates by service", "limit": 2}`)
	resp, err := http.Post(target+"/api/search", "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("rest search: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("rest search: status %d", resp.StatusCode)
	}
	log.Printf("%-10s ok", "RESTSearch")
	return nil
}

// ---------------------------------------------------------------------------
// Minimal HS256 JWT — no dependency, fixed demo secret
// ---------------------------------------------------------------------------

func signJWT(sub string, ttl time.Duration) string {
	now := time.Now().UTC()
	header := b64url([]byte(`{"alg":"HS256","typ":"JWT"}`))
	claims, _ := json.Marshal(map[string]any{
		"sub": sub,
		"iat": now.Unix(),
		"exp": now.Add(ttl).Unix(),
	})
	signingInput := header + "." + b64url(claims)
	mac := hmac.New(sha256.New, []byte(jwtSecret))
	mac.Write([]byte(signingInput))
	return signingInput + "." + b64url(mac.Sum(nil))
}

func verifyJWT(token string) (map[string]any, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return nil, errors.New("token is not a JWT")
	}
	mac := hmac.New(sha256.New, []byte(jwtSecret))
	mac.Write([]byte(parts[0] + "." + parts[1]))
	want := b64url(mac.Sum(nil))
	if !hmac.Equal([]byte(want), []byte(parts[2])) {
		return nil, errors.New("token signature invalid")
	}
	claimBytes, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, errors.New("token claims undecodable")
	}
	var claims map[string]any
	if err := json.Unmarshal(claimBytes, &claims); err != nil {
		return nil, errors.New("token claims not JSON")
	}
	exp, ok := claims["exp"].(float64)
	if !ok || time.Now().UTC().Unix() > int64(exp) {
		return nil, errors.New("token expired")
	}
	return claims, nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		log.Printf("writing response: %v", err)
	}
}

func b64url(b []byte) string {
	return base64.RawURLEncoding.EncodeToString(b)
}

func sha256Hex(s string) string {
	sum := sha256.Sum256([]byte(s))
	return hex.EncodeToString(sum[:])
}

func randomHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		log.Fatalf("rand: %v", err)
	}
	return hex.EncodeToString(b)
}
