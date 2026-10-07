package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strings"
)

// traceContext is the W3C trace context of the request being served.
type traceContext struct {
	TraceID string // 32 lower-case hex
	SpanID  string // 16 lower-case hex, this service's span for the request
	Flags   string // 2 hex
	Started bool   // true when no valid traceparent arrived and this service started the trace
}

// Traceparent renders the context as a W3C traceparent value.
func (t traceContext) Traceparent() string {
	return "00-" + t.TraceID + "-" + t.SpanID + "-" + t.Flags
}

var traceparentRe = regexp.MustCompile(`^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$`)

// traceFromRequest continues the trace of the inbound traceparent header, or starts a new trace when there is none or
// it is malformed. Either way the request gets a new span id of its own, as an OpenTelemetry server span would.
func traceFromRequest(r *http.Request) traceContext {
	m := traceparentRe.FindStringSubmatch(strings.ToLower(strings.TrimSpace(r.Header.Get("traceparent"))))
	if m != nil && strings.Trim(m[1], "0") != "" && strings.Trim(m[2], "0") != "" {
		return traceContext{TraceID: m[1], SpanID: randomHex(8), Flags: m[3]}
	}
	return traceContext{TraceID: randomHex(16), SpanID: randomHex(8), Flags: "01", Started: true}
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

type requestTagsKey struct{}

// requestTags is what each SQL statement a request runs is tagged with.
type requestTags struct {
	Trace traceContext
	Route string // the route template, such as /orders/{id}
}

func withRequestTags(ctx context.Context, tags requestTags) context.Context {
	return context.WithValue(ctx, requestTagsKey{}, tags)
}

func tagsFrom(ctx context.Context) (requestTags, bool) {
	tags, ok := ctx.Value(requestTagsKey{}).(requestTags)
	return tags, ok
}

// sqlComment renders tags in the sqlcommenter format (https://google.github.io/sqlcommenter/spec/): keys sorted,
// each value URL-encoded and wrapped in single quotes, pairs joined by commas, all inside one /* */ comment.
func sqlComment(tags map[string]string) string {
	if len(tags) == 0 {
		return ""
	}
	keys := make([]string, 0, len(tags))
	for k := range tags {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, encodeCommentPart(k)+"='"+encodeCommentPart(tags[k])+"'")
	}
	return "/*" + strings.Join(parts, ",") + "*/"
}

// encodeCommentPart URL-encodes a key or value and escapes single quotes, as the sqlcommenter spec requires.
func encodeCommentPart(s string) string {
	return strings.ReplaceAll(url.PathEscape(s), "'", `\'`)
}

// tag appends the sqlcommenter comment for the request in ctx to sql. A statement run outside a request (start-up,
// the health check) is returned unchanged.
func tag(ctx context.Context, sql string) string {
	tags, ok := tagsFrom(ctx)
	if !ok {
		return sql
	}
	return sql + " " + sqlComment(map[string]string{
		"db_driver":   "pgx",
		"route":       tags.Route,
		"traceparent": tags.Trace.Traceparent(),
	})
}
