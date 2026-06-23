// Drift demo — a tiny HTTP service whose recorded traffic deliberately
// drifts across runs in well-defined fields. Designed to exercise
// `proxymock drift` end-to-end:
//
//  1. Record the app via `proxymock record`.
//  2. Hit each endpoint a few times (./driver.sh or by hand).
//  3. Repeat steps 1–2 a few more times, producing recorded-* dirs.
//  4. Run `proxymock drift --source recorded-1 --source recorded-2 ...`.
//
// The drift detector should surface (at minimum) these locations:
//
//	IN  http.req.headers.X-Request-Id[0]    (every endpoint)
//	IN  http.req.bodyBase64.user_id          (POST /checkout)
//	IN  http.req.bodyBase64.cart_id          (POST /checkout)
//	IN  http.req.bodyBase64.session_id       (POST /checkout)
//	IN  http.req.url.query.session           (GET /search)
//	IN  http.req.url.query._t                (GET /search)
//	OUT http.req.headers.Authorization[0]    (every outbound call)
//	OUT http.req.headers.X-Trace-Id[0]       (every outbound call)
//	OUT http.req.url.query.cache_bust        (every outbound call)
//	OUT http.req.bodyBase64.transaction_id   (POST /anything from checkout)
//	OUT http.req.bodyBase64.request_nonce    (POST /anything from checkout)
//	OUT http.req.bodyBase64.ts               (POST /anything from checkout)
//	OUT http.req.bodyBase64.user_id          (POST /anything from checkout)
//	OUT http.req.bodyBase64.cart_id          (POST /anything from checkout)
//	OUT http.req.bodyBase64.payment.auth_token (POST /anything from checkout)
//
// The outbound POST /anything body is intentionally a nested mix of stable
// and volatile leaves (merchant_id/currency/channel/items/payment.method
// stay constant; the fields above drift) so per-field signature analysis in
// the Mocks workflow has a realistic body to classify field-by-field. The
// volatile leaves also span the cause classifier's value types — ts (datetime),
// request_id (uuid), client_ip (ip), notify_email (pii), and the hex ids
// (random token) — so the Signature panel exercises each typed-drop label, and
// the GET /anything search call adds a req_uuid query param for key-level
// classification.
//
// Stable fields (paths, methods, hostnames, item names, structure) will
// NOT show up as drift, so the report stays focused on the values the
// user would actually want to wildcard-ignore in their replays.
package main

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strconv"
	"time"
)

const (
	port = "8080"
	// upstream is the third-party we make outbound calls to so the app
	// produces OUT-direction traffic for proxymock to capture. httpbin
	// echoes whatever we send so the recording carries every drifting
	// field we generate. Plain HTTP (not HTTPS) on purpose: avoids the
	// MITM-CA setup proxymock would otherwise need to intercept TLS
	// during demo recording. Override with UPSTREAM env var.
	defaultUpstream = "http://httpbin.org"
)

func upstream() string {
	if v := os.Getenv("UPSTREAM"); v != "" {
		return v
	}
	return defaultUpstream
}

// newID returns a 16-hex-char random token. Used for transaction_id /
// X-Trace-Id / cache_bust — fields that drift on every call so two
// recordings of the same endpoint sequence diverge on these values. An
// unrecognized shape, so the Mocks cause classifier labels it a "random token".
func newID() string {
	var b [8]byte
	_, _ = rand.Read(b[:])
	return hex.EncodeToString(b[:])
}

// newUUID returns a random RFC 4122 v4 UUID. Unlike newID, this shape IS
// recognized by the Mocks cause classifier, which labels its drift "uuid".
func newUUID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = (b[6] & 0x0f) | 0x40 // version 4
	b[8] = (b[8] & 0x3f) | 0x80 // variant 10
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// randomIPv4 returns a random dotted-quad address; the classifier labels its
// drift "ip".
func randomIPv4() string {
	var b [4]byte
	_, _ = rand.Read(b[:])
	return fmt.Sprintf("%d.%d.%d.%d", b[0], b[1], b[2], b[3])
}

// rotatingToken returns a fake bearer token that changes per call. Models
// a real-world short-TTL auth token; surfaces as Authorization-header
// drift in OUT recordings.
func rotatingToken() string {
	return "Bearer " + newID() + newID()
}

func main() {
	mux := http.NewServeMux()
	mux.HandleFunc("/checkout", checkoutHandler)
	mux.HandleFunc("/search", searchHandler)
	mux.HandleFunc("/profile/", profileHandler)
	mux.HandleFunc("/cat-fact", catFactHandler)
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, _ *http.Request) { _, _ = w.Write([]byte("ok")) })

	addr := ":" + port
	log.Printf("drift demo listening on %s; upstream=%s", addr, upstream())
	log.Fatal(http.ListenAndServe(addr, mux))
}

// checkoutHandler accepts a JSON cart payload and forwards a derived
// transaction record to the upstream. Drifts both directions:
//
//	IN  body fields user_id/cart_id/session_id (caller-supplied)
//	OUT body field transaction_id, ts; header Authorization, X-Trace-Id
func checkoutHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var in struct {
		UserID    string   `json:"user_id"`
		CartID    string   `json:"cart_id"`
		SessionID string   `json:"session_id"`
		Items     []string `json:"items"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		http.Error(w, "bad json: "+err.Error(), http.StatusBadRequest)
		return
	}

	// Outbound: forward the cart to the upstream as a transaction record.
	// The body is a deliberate mix of STABLE and VOLATILE leaf fields,
	// nested, so per-field drift analysis has something to distinguish:
	//
	//   KEEP (stable across calls — what makes a mock match meaningful):
	//     merchant_id, currency, channel, items[*], payment.method
	//   DROP (volatile every call — what breaks signature matching on replay):
	//     transaction_id, request_nonce, user_id, cart_id, payment.auth_token
	//       → unrecognized shapes, classifier labels each "random token"
	//     ts            → "datetime"
	//     request_id    → "uuid"
	//     client_ip     → "ip"
	//     notify_email  → "pii"
	//
	// On replay, the volatile leaves diverge from the recorded mock, so the
	// outbound request misses. The Mocks workflow's per-field signature analysis
	// recommends dropping exactly the volatile leaves (keeping the stable ones),
	// and its cause classifier labels each drop by the *kind* of value.
	payload := map[string]any{
		"merchant_id": "merch-acme-01",
		"currency":    "USD",
		"channel":     "web",
		"items":       in.Items, // caller sends the same item names every run

		"transaction_id": newID(),
		"request_nonce":  newID(),
		"user_id":        in.UserID, // value drifts via the caller
		"cart_id":        in.CartID, // value drifts via the caller

		// Recognizable dynamic types — the cause classifier labels these by kind
		// (datetime / uuid / ip / pii) instead of a generic "random token".
		"ts":           time.Now().UTC().Format(time.RFC3339Nano),
		"request_id":   newUUID(),
		"client_ip":    randomIPv4(),
		"notify_email": "shopper-" + newID() + "@example.com",

		"payment": map[string]any{
			"method":     "card",
			"auth_token": newID(), // nested volatile leaf: payment.auth_token
		},
	}
	body, _ := json.Marshal(payload)
	upstreamResp, err := outboundCall(http.MethodPost, "/anything", body)
	if err != nil {
		http.Error(w, "upstream: "+err.Error(), http.StatusBadGateway)
		return
	}

	out := map[string]any{
		"status":   "queued",
		"echo":     upstreamResp, // surface what we sent so the response carries OUT-drift values too
		"order_id": newID(),      // and one drifting value in the response we return inbound
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

// searchHandler models a typical "?q=…" search endpoint. Drifts:
//
//	IN  query params session, _t; header X-Request-Id
//	OUT query params cache_bust (→ "random token") and req_uuid (→ "uuid") —
//	    key-level cause classification, vs the body-leaf classification on /checkout
func searchHandler(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query().Get("q")
	if q == "" {
		http.Error(w, "q is required", http.StatusBadRequest)
		return
	}

	// Outbound search. Same stable q; drifting cache_bust (random) and a
	// per-request req_uuid (recognized as a uuid by the cause classifier).
	path := "/anything?q=" + q + "&cache_bust=" + newID() + "&req_uuid=" + newUUID()
	upstreamResp, err := outboundCall(http.MethodGet, path, nil)
	if err != nil {
		http.Error(w, "upstream: "+err.Error(), http.StatusBadGateway)
		return
	}

	out := map[string]any{
		"q":         q,
		"search_id": newID(), // drifting per-response id surfaces in INBOUND too
		"echo":      upstreamResp,
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

// profileHandler is the simplest endpoint: stable path + method, but the
// caller's X-Request-Id and X-Forwarded-For drift across runs. Useful as
// a control — proves drift detection picks up headers even when bodies
// and URLs stay identical between recordings.
func profileHandler(w http.ResponseWriter, r *http.Request) {
	upstreamResp, err := outboundCall(http.MethodGet, "/anything?profile_for="+r.URL.Path, nil)
	if err != nil {
		http.Error(w, "upstream: "+err.Error(), http.StatusBadGateway)
		return
	}
	out := map[string]any{
		"path":          r.URL.Path,
		"last_login_at": time.Now().UTC().Format(time.RFC3339), // drifts every call
		"echo":          upstreamResp,
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

// catFactHandler fetches a random cat fact from the public Cat Facts API
// (no API key required). Returns the fact and length as JSON.
func catFactHandler(w http.ResponseWriter, r *http.Request) {
	resp, err := http.Get("https://catfact.ninja/fact")
	if err != nil {
		http.Error(w, "cat fact upstream: "+err.Error(), http.StatusBadGateway)
		return
	}
	defer resp.Body.Close()

	var fact struct {
		Fact   string `json:"fact"`
		Length int    `json:"length"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&fact); err != nil {
		http.Error(w, "bad response from cat facts: "+err.Error(), http.StatusInternalServerError)
		return
	}

	out := map[string]any{
		"fact":   fact.Fact,
		"length": fact.Length,
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

// outboundCall stamps the drifting Authorization / X-Trace-Id headers on
// every outbound request. The HTTP client honors HTTP_PROXY env vars
// (Go's default ProxyFromEnvironment), so when proxymock-record is in
// place these calls flow through the proxy and land in the recording.
func outboundCall(method, path string, body []byte) (map[string]any, error) {
	var bodyReader io.Reader
	if body != nil {
		bodyReader = bytes.NewReader(body)
	}
	req, err := http.NewRequest(method, upstream()+path, bodyReader)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", rotatingToken())
	req.Header.Set("X-Trace-Id", newID())
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Content-Length", strconv.Itoa(len(body)))
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		// upstream gave non-JSON; return a stub so the demo doesn't fail
		return map[string]any{"raw": string(raw)}, nil
	}
	return out, nil
}
