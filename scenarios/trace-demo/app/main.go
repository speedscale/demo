// trace-demo is a single binary that plays one of several roles in a small
// distributed "checkout" call graph. Run as different roles (set ROLE) it
// becomes the client (loadgen) or one of the services (gateway, cart, pricing,
// tax, payment, shipping).
//
// Every request carries W3C `traceparent`, Zipkin B3 (`X-B3-*`), and a stable
// `X-Trace-Id` that is constant across all hops of one logical request. Each
// service mints a fresh child span id for every downstream call and propagates
// the parent linkage, so a Speedscale/proxymock recording of this stack yields
// real distributed traces: filter the Requests grid by one `X-Trace-Id` value
// and the proxymock-web Trace waterfall reconstructs that request's full
// journey (gateway → cart / pricing → tax / payment / shipping).
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log"
	"math/rand"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"
)

// httpClient is shared by every downstream call; the short timeout keeps a slow
// or failing dependency from stalling a whole trace.
var httpClient = &http.Client{Timeout: 5 * time.Second}

func main() {
	role := strings.ToLower(env("ROLE", "gateway"))
	log.SetFlags(log.LstdFlags | log.Lmsgprefix)
	log.SetPrefix("[" + role + "] ")

	if role == "loadgen" {
		runLoadgen()
		return
	}
	runServer(role)
}

// ─── trace context ───────────────────────────────────────────────────────────

// traceCtx is the propagation state for one in-flight request: the stable trace
// id shared by every hop, and the span id of the current hop (which becomes the
// parent span id of any downstream call this hop makes).
type traceCtx struct {
	traceID string
	spanID  string
}

// incoming reconstructs the trace context from an inbound request's headers,
// minting fresh ids when a header is absent (e.g. a request that entered without
// trace context). It reads X-Trace-Id first, then B3, then traceparent.
func incoming(r *http.Request) traceCtx {
	tid := firstNonEmpty(
		r.Header.Get("X-Trace-Id"),
		r.Header.Get("X-B3-TraceId"),
		traceparentField(r.Header.Get("traceparent"), 1),
	)
	if tid == "" {
		tid = genID(16)
	}
	sid := firstNonEmpty(
		r.Header.Get("X-B3-SpanId"),
		traceparentField(r.Header.Get("traceparent"), 2),
	)
	if sid == "" {
		sid = genID(8)
	}
	return traceCtx{traceID: tid, spanID: sid}
}

// childHeaders returns the propagation headers for a downstream call: the trace
// id stays constant, `child` is the new span, and the current hop's span becomes
// the parent. Pure (no I/O) so it can be unit-tested.
func childHeaders(tc traceCtx, child string) map[string]string {
	return map[string]string{
		"X-Trace-Id":        tc.traceID,
		"X-Request-Id":      tc.traceID,
		"traceparent":       "00-" + tc.traceID + "-" + child + "-01",
		"X-B3-TraceId":      tc.traceID,
		"X-B3-SpanId":       child,
		"X-B3-ParentSpanId": tc.spanID,
	}
}

// call makes a downstream request as a child span of tc and returns the status
// code. Body bytes are drained so connections are reused across a trace.
func call(ctx context.Context, tc traceCtx, method, url string, body []byte) (int, error) {
	var rdr io.Reader
	if body != nil {
		rdr = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, rdr)
	if err != nil {
		return 0, err
	}
	for k, v := range childHeaders(tc, genID(8)) {
		req.Header.Set(k, v)
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := httpClient.Do(req)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	return resp.StatusCode, nil
}

// ─── servers ─────────────────────────────────────────────────────────────────

func runServer(role string) {
	mux := http.NewServeMux()
	// Liveness/readiness; never instrumented as a trace hop.
	mux.HandleFunc("/health", func(w http.ResponseWriter, _ *http.Request) { io.WriteString(w, "ok") })

	switch role {
	case "gateway":
		mux.HandleFunc("/checkout", gatewayCheckout)
	case "cart":
		mux.HandleFunc("/cart/validate", leaf(15, 40, 0))
	case "pricing":
		mux.HandleFunc("/price", pricingPrice)
	case "tax":
		mux.HandleFunc("/tax/calculate", leaf(10, 30, 0))
	case "payment":
		// Payment fails ~12% of the time so the waterfall has error spans.
		mux.HandleFunc("/charge", leaf(30, 90, 12))
	case "shipping":
		mux.HandleFunc("/ship", leaf(10, 25, 0))
	default:
		log.Fatalf("unknown ROLE %q (want gateway|cart|pricing|tax|payment|shipping|loadgen)", role)
	}

	addr := ":" + env("PORT", "8080")
	log.Printf("listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}

// gatewayCheckout is the trace root on the server side: it fans out to the
// downstream services, each as a child span, and fails the checkout if payment
// declines so an error propagates up the trace.
func gatewayCheckout(w http.ResponseWriter, r *http.Request) {
	tc := incoming(r)
	ctx := r.Context()
	work(8, 18)

	_, _ = call(ctx, tc, http.MethodGet, urlFor("CART_URL", "http://cart")+"/cart/validate", nil)
	_, _ = call(ctx, tc, http.MethodPost, urlFor("PRICING_URL", "http://pricing")+"/price", []byte(`{"sku":"DONUT-001","qty":3}`))

	payStatus, _ := call(ctx, tc, http.MethodPost, urlFor("PAYMENT_URL", "http://payment")+"/charge", []byte(`{"amount":1299}`))
	if payStatus >= 500 || payStatus == http.StatusPaymentRequired {
		writeJSON(w, http.StatusBadGateway, map[string]any{"ok": false, "stage": "payment", "trace": tc.traceID})
		return
	}

	_, _ = call(ctx, tc, http.MethodPost, urlFor("SHIPPING_URL", "http://shipping")+"/ship", []byte(`{"addr":"1 Main St"}`))
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "trace": tc.traceID})
}

// pricingPrice adds the one second-level hop in the graph (pricing → tax), so
// the trace has depth beyond the gateway's direct children.
func pricingPrice(w http.ResponseWriter, r *http.Request) {
	tc := incoming(r)
	work(12, 30)
	_, _ = call(r.Context(), tc, http.MethodGet, urlFor("TAX_URL", "http://tax")+"/tax/calculate", nil)
	writeJSON(w, http.StatusOK, map[string]any{"price": 1299, "currency": "USD"})
}

// leaf returns a handler that simulates processing latency and, with failPct
// probability, returns a 500 — used for the services at the edge of the graph.
func leaf(minMs, maxMs, failPct int) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		work(minMs, maxMs)
		if failPct > 0 && rand.Intn(100) < failPct {
			writeJSON(w, http.StatusInternalServerError, map[string]any{"ok": false})
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"ok": true})
	}
}

// ─── loadgen (client) ────────────────────────────────────────────────────────

// runLoadgen is the client role: it drives at least COUNT distinct traces
// through the gateway (each with a fresh root trace + span id), then keeps
// looping when LOOP=true so a recording window of any length captures traffic.
func runLoadgen() {
	gateway := urlFor("GATEWAY_URL", "http://gateway")
	count := envInt("COUNT", 150)
	delay := time.Duration(envInt("DELAY_MS", 150)) * time.Millisecond
	loop := strings.ToLower(env("LOOP", "true")) == "true"

	// Give the services time to come up before the first request.
	waitReady(gateway + "/health")
	log.Printf("driving %d traces at %s (delay=%s, loop=%t)", count, gateway, delay, loop)

	sent, errs := 0, 0
	for {
		for i := 0; i < count; i++ {
			if err := oneCheckout(gateway); err != nil {
				errs++
			}
			sent++
			if sent%25 == 0 {
				log.Printf("sent %d traces (%d errors)", sent, errs)
			}
			time.Sleep(delay)
		}
		if !loop {
			log.Printf("done: %d traces sent (%d failed)", sent, errs)
			select {} // idle so the pod (and its recorded data) stays up
		}
	}
}

// oneCheckout sends a single /checkout as a brand-new trace root.
func oneCheckout(gateway string) error {
	tc := traceCtx{traceID: genID(16), spanID: genID(8)}
	body, _ := json.Marshal(map[string]any{"cart": []string{"DONUT-001", "COFFEE-002"}})
	req, err := http.NewRequest(http.MethodPost, gateway+"/checkout", bytes.NewReader(body))
	if err != nil {
		return err
	}
	// The root has no parent span; everything downstream descends from this.
	for k, v := range childHeaders(tc, tc.spanID) {
		req.Header.Set(k, v)
	}
	req.Header.Del("X-B3-ParentSpanId")
	req.Header.Set("Content-Type", "application/json")
	resp, err := httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)
	return nil
}

func waitReady(healthURL string) {
	for i := 0; i < 60; i++ {
		if resp, err := httpClient.Get(healthURL); err == nil {
			resp.Body.Close()
			return
		}
		time.Sleep(2 * time.Second)
	}
}

// ─── helpers ─────────────────────────────────────────────────────────────────

// work blocks for a random duration in [minMs, maxMs] so recorded spans have
// realistic, varied widths in the waterfall.
func work(minMs, maxMs int) {
	d := minMs
	if maxMs > minMs {
		d += rand.Intn(maxMs - minMs)
	}
	time.Sleep(time.Duration(d) * time.Millisecond)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// traceparentField returns the i-th dash-separated field of a W3C traceparent
// (1 = trace id, 2 = span id), or "" if absent/malformed.
func traceparentField(tp string, i int) string {
	if tp == "" {
		return ""
	}
	parts := strings.Split(tp, "-")
	if len(parts) <= i {
		return ""
	}
	return strings.ToLower(parts[i])
}

func genID(nBytes int) string {
	const hexdigits = "0123456789abcdef"
	b := make([]byte, nBytes*2)
	for i := range b {
		b[i] = hexdigits[rand.Intn(16)]
	}
	return string(b)
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

func urlFor(envKey, def string) string { return strings.TrimRight(env(envKey, def), "/") }

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return def
}
