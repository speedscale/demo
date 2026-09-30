package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

// fakeStore is an in-memory Store, so the tests need no Postgres.
type fakeStore struct {
	mu      sync.Mutex
	orders  map[string]OrderRow
	lines   map[string][]Line
	created int
	calls   []string
}

func newFakeStore() *fakeStore {
	return &fakeStore{orders: map[string]OrderRow{}, lines: map[string][]Line{}}
}

var fixedCreated = time.Date(2026, 9, 30, 10, 44, 50, 123999000, time.UTC)

func (f *fakeStore) CreateOrder(_ context.Context, id, customer string, total int, lines []Line) (time.Time, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.created++
	f.orders[id] = OrderRow{ID: id, Customer: customer, Status: "placed", TotalCents: total, CreatedAt: fixedCreated, ItemCount: len(lines)}
	f.lines[id] = lines
	return fixedCreated, nil
}

func (f *fakeStore) GetOrder(_ context.Context, id string) (OrderRow, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, "S3")
	o, ok := f.orders[id]
	if !ok {
		return OrderRow{}, errOrderNotFound
	}
	return o, nil
}

func (f *fakeStore) GetLines(_ context.Context, id string) ([]Line, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, "S4")
	return append([]Line{}, f.lines[id]...), nil
}

func (f *fakeStore) OrderStatus(_ context.Context, id string) (string, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, "S7")
	o, ok := f.orders[id]
	if !ok {
		return "", errOrderNotFound
	}
	return o.Status, nil
}

func (f *fakeStore) list() []OrderRow {
	out := []OrderRow{}
	for _, o := range f.orders {
		out = append(out, o)
	}
	return out
}

func (f *fakeStore) ListRecent(context.Context, time.Time) ([]OrderRow, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, "S5")
	rows := f.list()
	for i := range rows {
		rows[i].ItemCount = 0
	}
	return rows, nil
}

func (f *fakeStore) ListRecentWithCounts(context.Context, time.Time) ([]OrderRow, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls = append(f.calls, "S6")
	return f.list(), nil
}

// fakeUpstream answers the CNCF projects API.
func fakeUpstream(t *testing.T, seen *[]*http.Request) *httptest.Server {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if seen != nil {
			*seen = append(*seen, r.Clone(context.Background()))
		}
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/v1/projects":
			_, _ = w.Write([]byte(`[{"id":"kubernetes","name":"Kubernetes","maturity":"Graduated","stars":1},{"id":"helm","name":"Helm","maturity":"Incubating"},{"id":"kepler","name":"Kepler","maturity":"Sandbox"},{"id":"odd","name":"Odd","maturity":"Archived"}]`))
		case "/v1/project/kubernetes":
			_, _ = w.Write([]byte(`{"id":"kubernetes","name":"Kubernetes","maturity":"Graduated"}`))
		case "/v1/project/helm":
			_, _ = w.Write([]byte(`{"id":"helm","name":"Helm","maturity":"Incubating"}`))
		case "/v1/project/kepler":
			_, _ = w.Write([]byte(`{"id":"kepler","name":"Kepler","maturity":"Sandbox"}`))
		case "/v1/project/boom":
			w.WriteHeader(http.StatusInternalServerError)
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(srv.Close)
	return srv
}

func newTestApp(t *testing.T, version string, slow bool) (*App, *fakeStore, *[]*http.Request) {
	t.Helper()
	var seen []*http.Request
	up := fakeUpstream(t, &seen)
	store := newFakeStore()
	app := &App{
		Store:    store,
		Upstream: NewUpstream(up.URL),
		Version:  version,
		Slow:     slow,
		Now:      func() time.Time { return time.Date(2026, 9, 30, 11, 0, 1, 987654321, time.UTC) },
	}
	return app, store, &seen
}

func do(app *App, method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	rec := httptest.NewRecorder()
	app.Routes().ServeHTTP(rec, req)
	return rec
}

func TestValidationMessages(t *testing.T) {
	cases := []struct {
		name, body, want string
	}{
		{"not json", `nope`, "invalid JSON body"},
		{"array", `[1]`, "invalid JSON body"},
		{"trailing data", `{"customer":"a","items":[]} x`, "invalid JSON body"},
		{"no customer", `{"items":[{"project_id":"kubernetes","quantity":1}]}`, "customer is required"},
		{"customer not string", `{"customer":5,"items":[]}`, "customer is required"},
		{"empty customer", `{"customer":"","items":[]}`, "customer is required"},
		{"no items", `{"customer":"a"}`, "items must have 1 to 10 entries"},
		{"items not array", `{"customer":"a","items":{}}`, "items must have 1 to 10 entries"},
		{"empty items", `{"customer":"a","items":[]}`, "items must have 1 to 10 entries"},
		{"too many items", `{"customer":"a","items":[` + strings.Repeat(`{"project_id":"kubernetes","quantity":1},`, 10) + `{"project_id":"kubernetes","quantity":1}]}`, "items must have 1 to 10 entries"},
		{"no project", `{"customer":"a","items":[{"quantity":1}]}`, "project_id is required"},
		{"empty project", `{"customer":"a","items":[{"project_id":"","quantity":1}]}`, "project_id is required"},
		{"item not object", `{"customer":"a","items":[3]}`, "project_id is required"},
		{"no quantity", `{"customer":"a","items":[{"project_id":"helm"}]}`, "quantity must be between 1 and 99"},
		{"quantity zero", `{"customer":"a","items":[{"project_id":"helm","quantity":0}]}`, "quantity must be between 1 and 99"},
		{"quantity 100", `{"customer":"a","items":[{"project_id":"helm","quantity":100}]}`, "quantity must be between 1 and 99"},
		{"quantity fraction", `{"customer":"a","items":[{"project_id":"helm","quantity":1.5}]}`, "quantity must be between 1 and 99"},
		{"quantity null", `{"customer":"a","items":[{"project_id":"helm","quantity":null}]}`, "quantity must be between 1 and 99"},
		{"empty body", ``, "invalid JSON body"},
		{"quantity string", `{"customer":"a","items":[{"project_id":"helm","quantity":"2"}]}`, "quantity must be between 1 and 99"},
		{"first bad item wins", `{"customer":"a","items":[{"project_id":"helm","quantity":0},{"quantity":1}]}`, "quantity must be between 1 and 99"},
	}
	app, store, seen := newTestApp(t, "v1", false)
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rec := do(app, "POST", "/orders", tc.body)
			if rec.Code != 400 {
				t.Fatalf("status %d, want 400: %s", rec.Code, rec.Body)
			}
			want := `{"error":"` + tc.want + `"}`
			if rec.Body.String() != want {
				t.Fatalf("body %s, want %s", rec.Body, want)
			}
		})
	}
	if len(*seen) != 0 || store.created != 0 {
		t.Fatalf("validation failures must not call upstream or the database")
	}
}

func TestQuantityAcceptsIntegralFloat(t *testing.T) {
	req, msg := ParseOrderRequest([]byte(`{"customer":"a","items":[{"project_id":"helm","quantity":2.0}]}`))
	if msg != "" || req.Items[0].Quantity != 2 {
		t.Fatalf("2.0 must count as 2: %q %+v", msg, req)
	}
}

func TestPricing(t *testing.T) {
	for m, want := range map[string]int{"Graduated": 1200, "Incubating": 800, "Sandbox": 500, "Archived": 1000, "": 1000} {
		if got := PriceCents(m); got != want {
			t.Errorf("PriceCents(%q) = %d, want %d", m, got, want)
		}
	}
}

func TestCatalog(t *testing.T) {
	app, _, seen := newTestApp(t, "v1", false)
	rec := do(app, "GET", "/catalog", "")
	want := `{"products":[` +
		`{"project_id":"kubernetes","name":"Kubernetes","maturity":"Graduated","unit_price_cents":1200},` +
		`{"project_id":"helm","name":"Helm","maturity":"Incubating","unit_price_cents":800},` +
		`{"project_id":"kepler","name":"Kepler","maturity":"Sandbox","unit_price_cents":500},` +
		`{"project_id":"odd","name":"Odd","maturity":"Archived","unit_price_cents":1000}],` +
		`"generated_at":"2026-09-30T11:00:01.987Z"}`
	if rec.Code != 200 || rec.Body.String() != want {
		t.Fatalf("got %d %s\nwant %s", rec.Code, rec.Body, want)
	}
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Fatalf("content type %q", ct)
	}

	if len(*seen) != 1 {
		t.Fatalf("want 1 upstream call, got %d", len(*seen))
	}
	r := (*seen)[0]
	if r.Method != "GET" || r.URL.Path != "/v1/projects" {
		t.Errorf("upstream %s %s", r.Method, r.URL.Path)
	}
	ts, err := strconv.ParseInt(r.URL.Query().Get("ts"), 10, 64)
	if err != nil || time.Since(time.UnixMilli(ts)) > time.Minute || time.Since(time.UnixMilli(ts)) < -time.Minute {
		t.Errorf("ts = %q is not unix milliseconds", r.URL.Query().Get("ts"))
	}
	if r.Header.Get("Accept") != "application/json" || r.Header.Get("User-Agent") != "tutorial-orders/1" {
		t.Errorf("headers %v", r.Header)
	}
	if !regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`).MatchString(r.Header.Get("X-Request-Id")) {
		t.Errorf("X-Request-Id %q is not a v4 UUID", r.Header.Get("X-Request-Id"))
	}
}

func TestUpstreamFailureIs502(t *testing.T) {
	app, store, _ := newTestApp(t, "v1", false)
	rec := do(app, "POST", "/orders", `{"customer":"a","items":[{"project_id":"boom","quantity":1}]}`)
	if rec.Code != 502 || rec.Body.String() != `{"error":"catalog unavailable"}` {
		t.Fatalf("got %d %s", rec.Code, rec.Body)
	}
	app.Upstream = NewUpstream("http://127.0.0.1:1")
	rec = do(app, "GET", "/catalog", "")
	if rec.Code != 502 || rec.Body.String() != `{"error":"catalog unavailable"}` {
		t.Fatalf("got %d %s", rec.Code, rec.Body)
	}
	if store.created != 0 {
		t.Fatal("nothing may be written")
	}
}

func TestUnknownProjectIs422AndWritesNothing(t *testing.T) {
	app, store, seen := newTestApp(t, "v1", false)
	rec := do(app, "POST", "/orders", `{"customer":"a","items":[{"project_id":"kubernetes","quantity":1},{"project_id":"nope","quantity":1},{"project_id":"helm","quantity":1}]}`)
	if rec.Code != 422 || rec.Body.String() != `{"error":"unknown project: nope"}` {
		t.Fatalf("got %d %s", rec.Code, rec.Body)
	}
	if store.created != 0 {
		t.Fatal("nothing may be written")
	}
	if len(*seen) != 2 {
		t.Fatalf("processing must stop at the 404: %d upstream calls", len(*seen))
	}
}

var (
	tsRe = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$`)
	idRe = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$`)
)

func TestFormatTime(t *testing.T) {
	cases := map[time.Time]string{
		time.Date(2026, 9, 30, 10, 44, 50, 123999999, time.UTC):                    "2026-09-30T10:44:50.123Z", // truncated, not rounded
		time.Date(2026, 9, 30, 10, 44, 50, 0, time.UTC):                            "2026-09-30T10:44:50.000Z",
		time.Date(2026, 9, 30, 10, 44, 50, 5000000, time.UTC):                      "2026-09-30T10:44:50.005Z",
		time.Date(2026, 9, 30, 12, 44, 50, 999999999, time.FixedZone("x", 7200)):   "2026-09-30T10:44:50.999Z",
		time.Date(2026, 1, 2, 3, 4, 5, 600000, time.FixedZone("x", -5*3600)).UTC(): "2026-01-02T08:04:05.000Z",
	}
	for in, want := range cases {
		if got := FormatTime(in); got != want || !tsRe.MatchString(got) {
			t.Errorf("FormatTime(%v) = %s, want %s", in, got, want)
		}
	}
}

func TestOrderObjectKeyOrderAndFlow(t *testing.T) {
	app, store, seen := newTestApp(t, "v1", false)
	rec := do(app, "POST", "/orders", `{"customer":"ada@example.com","items":[{"project_id":"kubernetes","quantity":2},{"project_id":"kubernetes","quantity":1},{"project_id":"kepler","quantity":3}]}`)
	if rec.Code != 201 {
		t.Fatalf("got %d %s", rec.Code, rec.Body)
	}
	if len(*seen) != 3 {
		t.Fatalf("want one upstream call per item, got %d", len(*seen))
	}
	body := rec.Body.String()
	m := regexp.MustCompile(`^\{"id":"([0-9a-f-]{36})","customer":"ada@example.com","status":"placed","items":\[` +
		`\{"project_id":"kubernetes","name":"Kubernetes","quantity":2,"unit_price_cents":1200\},` +
		`\{"project_id":"kubernetes","name":"Kubernetes","quantity":1,"unit_price_cents":1200\},` +
		`\{"project_id":"kepler","name":"Kepler","quantity":3,"unit_price_cents":500\}\],` +
		`"total_cents":5100,"created_at":"2026-09-30T10:44:50\.123Z","generated_at":"2026-09-30T11:00:01\.987Z"\}$`).FindStringSubmatch(body)
	if m == nil {
		t.Fatalf("order object does not match the contract: %s", body)
	}
	if !idRe.MatchString(m[1]) {
		t.Errorf("id %q is not a lowercase v4 UUID", m[1])
	}
	if strings.Contains(strings.ReplaceAll(body, "ada@example.com", ""), " ") || strings.Contains(body, "\n") {
		t.Errorf("body is not compact: %q", body)
	}

	// GET returns the same shape.
	get := do(app, "GET", "/orders/"+m[1], "")
	if get.Code != 200 || get.Body.String() != body {
		t.Fatalf("GET differs from POST:\n%s\n%s", get.Body, body)
	}

	st := do(app, "GET", "/orders/"+m[1]+"/status", "")
	if want := `{"id":"` + m[1] + `","status":"placed","generated_at":"2026-09-30T11:00:01.987Z"}`; st.Code != 200 || st.Body.String() != want {
		t.Fatalf("status: %d %s", st.Code, st.Body)
	}
	_ = store
}

func TestOrderNotFound(t *testing.T) {
	app, store, _ := newTestApp(t, "v1", false)
	for _, path := range []string{
		"/orders/not-a-uuid",
		"/orders/%7B00000000-0000-4000-8000-000000000000%7D",
		"/orders/urn:uuid:00000000-0000-4000-8000-000000000000",
		"/orders/not-a-uuid/status",
		"/orders/00000000000040008000000000000000", // no hyphens: not canonical
	} {
		rec := do(app, "GET", path, "")
		if rec.Code != 404 || rec.Body.String() != `{"error":"order not found"}` {
			t.Errorf("%s: %d %s", path, rec.Code, rec.Body)
		}
	}
	if len(store.calls) != 0 {
		t.Errorf("invalid ids must not reach the database: %v", store.calls)
	}
	for _, path := range []string{"/orders/00000000-0000-4000-8000-000000000000", "/orders/00000000-0000-4000-8000-000000000000/status"} {
		rec := do(app, "GET", path, "")
		if rec.Code != 404 || rec.Body.String() != `{"error":"order not found"}` {
			t.Errorf("%s: %d %s", path, rec.Code, rec.Body)
		}
	}
	if got := strings.Join(store.calls, ","); got != "S3,S7" {
		t.Errorf("calls = %s", got)
	}
}

func TestUnknownPath(t *testing.T) {
	app, _, _ := newTestApp(t, "v1", false)
	rec := do(app, "GET", "/nope", "")
	if rec.Code != 404 || rec.Body.String() != `{"error":"not found"}` {
		t.Fatalf("%d %s", rec.Code, rec.Body)
	}
}

func TestHealthz(t *testing.T) {
	app, _, seen := newTestApp(t, "v2", false)
	rec := do(app, "GET", "/healthz", "")
	if rec.Body.String() != `{"status":"ok"}` || len(*seen) != 0 {
		t.Fatalf("%s", rec.Body)
	}
}

func TestV2RendersTotalAsString(t *testing.T) {
	app, _, _ := newTestApp(t, "v2", false)
	rec := do(app, "POST", "/orders", `{"customer":"a","items":[{"project_id":"kubernetes","quantity":2}]}`)
	if rec.Code != 201 || !strings.Contains(rec.Body.String(), `"total_cents":"2400","created_at"`) {
		t.Fatalf("order: %s", rec.Body)
	}
	list := do(app, "GET", "/orders", "")
	if !strings.Contains(list.Body.String(), `"item_count":1,"total_cents":"2400","created_at"`) {
		t.Fatalf("list: %s", list.Body)
	}

	// v1 keeps the number.
	app.Version = "v1"
	list = do(app, "GET", "/orders", "")
	if !strings.Contains(list.Body.String(), `"item_count":1,"total_cents":2400,"created_at"`) {
		t.Fatalf("v1 list: %s", list.Body)
	}
}

func TestListOrders(t *testing.T) {
	app, store, _ := newTestApp(t, "v1", false)
	empty := do(app, "GET", "/orders", "")
	if empty.Body.String() != `{"orders":[],"generated_at":"2026-09-30T11:00:01.987Z"}` {
		t.Fatalf("empty list: %s", empty.Body)
	}
	do(app, "POST", "/orders", `{"customer":"ada@example.com","items":[{"project_id":"kubernetes","quantity":2}]}`)
	store.calls = nil
	rec := do(app, "GET", "/orders", "")
	re := regexp.MustCompile(`^\{"orders":\[\{"id":"[0-9a-f-]{36}","customer":"ada@example.com","status":"placed","item_count":1,"total_cents":2400,"created_at":"2026-09-30T10:44:50\.123Z"\}\],"generated_at":"2026-09-30T11:00:01\.987Z"\}$`)
	if !re.MatchString(rec.Body.String()) {
		t.Fatalf("list: %s", rec.Body)
	}
	if got := strings.Join(store.calls, ","); got != "S6" {
		t.Errorf("default list ran %s, want S6", got)
	}
}

func TestSlowListRunsNPlusOne(t *testing.T) {
	app, store, _ := newTestApp(t, "v1", true)
	do(app, "POST", "/orders", `{"customer":"a","items":[{"project_id":"kubernetes","quantity":1},{"project_id":"helm","quantity":1}]}`)
	do(app, "POST", "/orders", `{"customer":"b","items":[{"project_id":"helm","quantity":1}]}`)
	store.calls = nil
	rec := do(app, "GET", "/orders", "")
	if got := strings.Join(store.calls, ","); got != "S5,S4,S4" {
		t.Errorf("slow list ran %s, want S5,S4,S4", got)
	}
	if !strings.Contains(rec.Body.String(), `"item_count":2`) || !strings.Contains(rec.Body.String(), `"item_count":1`) {
		t.Errorf("item counts from S4 row counts: %s", rec.Body)
	}
}

func TestUppercaseIDIsValid(t *testing.T) {
	app, store, _ := newTestApp(t, "v1", false)
	do(app, "POST", "/orders", `{"customer":"a","items":[{"project_id":"helm","quantity":1}]}`)
	var id string
	for k := range store.orders {
		id = k
	}
	rec := do(app, "GET", "/orders/"+strings.ToUpper(id), "")
	if rec.Code != 200 {
		t.Fatalf("uppercase id: %d %s", rec.Code, rec.Body)
	}
}

type brokenStore struct{ *fakeStore }

func (brokenStore) CreateOrder(context.Context, string, string, int, []Line) (time.Time, error) {
	return time.Time{}, context.DeadlineExceeded
}

func (brokenStore) GetOrder(context.Context, string) (OrderRow, error) {
	return OrderRow{}, context.DeadlineExceeded
}

func TestUnnamedFailureIs500(t *testing.T) {
	app, _, _ := newTestApp(t, "v1", false)
	app.Store = brokenStore{newFakeStore()}
	for _, tc := range [][3]string{
		{"POST", "/orders", `{"customer":"a","items":[{"project_id":"helm","quantity":1}]}`},
		{"GET", "/orders/00000000-0000-4000-8000-000000000000", ""},
	} {
		rec := do(app, tc[0], tc[1], tc[2])
		if rec.Code != 500 || rec.Body.String() != `{"error":"internal error"}` {
			t.Errorf("%s %s: %d %s", tc[0], tc[1], rec.Code, rec.Body)
		}
	}
}
