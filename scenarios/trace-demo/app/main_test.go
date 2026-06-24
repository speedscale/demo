package main

import (
	"net/http/httptest"
	"testing"
)

func TestChildHeaders_PropagatesTraceAndParent(t *testing.T) {
	tc := traceCtx{traceID: "0af7651916cd43dd8448eb211c80319c", spanID: "b7ad6b7169203331"}
	h := childHeaders(tc, "00f067aa0ba902b7")

	if h["X-Trace-Id"] != tc.traceID {
		t.Errorf("X-Trace-Id = %q, want stable trace id %q", h["X-Trace-Id"], tc.traceID)
	}
	if h["X-B3-ParentSpanId"] != tc.spanID {
		t.Errorf("parent span = %q, want current span %q", h["X-B3-ParentSpanId"], tc.spanID)
	}
	if h["X-B3-SpanId"] != "00f067aa0ba902b7" {
		t.Errorf("child span = %q, want new child", h["X-B3-SpanId"])
	}
	if want := "00-" + tc.traceID + "-00f067aa0ba902b7-01"; h["traceparent"] != want {
		t.Errorf("traceparent = %q, want %q", h["traceparent"], want)
	}
}

func TestIncoming_RoundTripsB3(t *testing.T) {
	// A child's headers, read back by the next service, must yield that child's
	// span as the new "current" span (so its downstreams parent onto it).
	parent := traceCtx{traceID: "abc123", spanID: "1111111111111111"}
	h := childHeaders(parent, "2222222222222222")

	r := httptest.NewRequest("GET", "/", nil)
	for k, v := range h {
		r.Header.Set(k, v)
	}
	got := incoming(r)

	if got.traceID != "abc123" {
		t.Errorf("traceID = %q, want abc123", got.traceID)
	}
	if got.spanID != "2222222222222222" {
		t.Errorf("spanID = %q, want the child span 2222222222222222", got.spanID)
	}
}

func TestIncoming_MintsWhenAbsent(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	got := incoming(r)
	if len(got.traceID) != 32 || len(got.spanID) != 16 {
		t.Errorf("minted ids wrong length: trace=%d span=%d", len(got.traceID), len(got.spanID))
	}
}

func TestTraceparentField(t *testing.T) {
	tp := "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01"
	if got := traceparentField(tp, 1); got != "0af7651916cd43dd8448eb211c80319c" {
		t.Errorf("trace id field = %q", got)
	}
	if got := traceparentField(tp, 2); got != "b7ad6b7169203331" {
		t.Errorf("span id field = %q", got)
	}
	if got := traceparentField("", 1); got != "" {
		t.Errorf("empty traceparent should yield empty, got %q", got)
	}
}
