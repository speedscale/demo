package main

import (
	"context"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestSQLCommentFollowsSpec(t *testing.T) {
	got := sqlComment(map[string]string{
		"traceparent": "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
		"route":       "/orders/{id}",
		"db_driver":   "pgx",
		"note":        "it's a, b",
	})
	want := `/*db_driver='pgx',note='it%27s%20a%2C%20b',route='%2Forders%2F%7Bid%7D',traceparent='00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'*/`
	if got != want {
		t.Fatalf("sqlComment:\n got %s\nwant %s", got, want)
	}
}

func TestTraceFromRequestContinuesInboundTrace(t *testing.T) {
	r := httptest.NewRequest("GET", "/orders/1", nil)
	r.Header.Set("traceparent", "00-4BF92F3577B34DA6A3CE929D0E0E4736-00f067aa0ba902b7-01")
	tc := traceFromRequest(r)
	if tc.TraceID != "4bf92f3577b34da6a3ce929d0e0e4736" || tc.Started {
		t.Fatalf("want the inbound trace continued, got %+v", tc)
	}
	if tc.SpanID == "00f067aa0ba902b7" || len(tc.SpanID) != 16 {
		t.Fatalf("want a new span id of this service's own, got %q", tc.SpanID)
	}
}

func TestTraceFromRequestStartsTraceWithoutValidHeader(t *testing.T) {
	for _, header := range []string{"", "garbage", "00-00000000000000000000000000000000-00f067aa0ba902b7-01"} {
		r := httptest.NewRequest("GET", "/orders/1", nil)
		if header != "" {
			r.Header.Set("traceparent", header)
		}
		tc := traceFromRequest(r)
		if !tc.Started || len(tc.TraceID) != 32 || strings.Trim(tc.TraceID, "0") == "" {
			t.Fatalf("header %q: want a new trace, got %+v", header, tc)
		}
	}
}

func TestTagLeavesStatementsOutsideARequestUntagged(t *testing.T) {
	if got := tag(context.Background(), "SELECT 1"); got != "SELECT 1" {
		t.Fatalf("got %q", got)
	}
	ctx := withRequestTags(context.Background(), requestTags{
		Trace: traceContext{TraceID: "4bf92f3577b34da6a3ce929d0e0e4736", SpanID: "00f067aa0ba902b7", Flags: "01"},
		Route: "/products",
	})
	want := "SELECT 1 /*db_driver='pgx',route='%2Fproducts',traceparent='00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01'*/"
	if got := tag(ctx, "SELECT 1"); got != want {
		t.Fatalf("got %q", got)
	}
}
