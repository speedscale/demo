package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"log"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
)

// App wires the handlers to their dependencies.
type App struct {
	Store    Store
	Upstream *Upstream
	Version  string
	Slow     bool
	Now      func() time.Time
}

// Routes returns the HTTP handler for the service.
func (a *App) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", a.healthz)
	mux.HandleFunc("GET /catalog", a.catalog)
	mux.HandleFunc("POST /orders", a.createOrder)
	mux.HandleFunc("GET /orders/{id}", a.getOrder)
	mux.HandleFunc("GET /orders/{id}/status", a.getStatus)
	mux.HandleFunc("GET /orders", a.listOrders)
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, http.StatusNotFound, "not found")
	})
	return mux
}

// FormatTime renders a UTC RFC 3339 timestamp with exactly three fractional
// digits. Go's formatter truncates, it does not round.
func FormatTime(t time.Time) string {
	return t.UTC().Format("2006-01-02T15:04:05.000Z")
}

func (a *App) stamp() string { return FormatTime(a.Now()) }

// totalValue renders total_cents: a JSON number, or a string under v2.
func (a *App) totalValue(cents int) any {
	if a.Version == "v2" {
		return strconv.Itoa(cents)
	}
	return cents
}

// Response shapes. Field order is the JSON key order of the contract.

type healthResponse struct {
	Status string `json:"status"`
}

type product struct {
	ProjectID      string `json:"project_id"`
	Name           string `json:"name"`
	Maturity       string `json:"maturity"`
	UnitPriceCents int    `json:"unit_price_cents"`
}

type catalogResponse struct {
	Products    []product `json:"products"`
	GeneratedAt string    `json:"generated_at"`
}

type orderResponse struct {
	ID          string `json:"id"`
	Customer    string `json:"customer"`
	Status      string `json:"status"`
	Items       []Line `json:"items"`
	TotalCents  any    `json:"total_cents"`
	CreatedAt   string `json:"created_at"`
	GeneratedAt string `json:"generated_at"`
}

type statusResponse struct {
	ID          string `json:"id"`
	Status      string `json:"status"`
	GeneratedAt string `json:"generated_at"`
}

type orderSummary struct {
	ID         string `json:"id"`
	Customer   string `json:"customer"`
	Status     string `json:"status"`
	ItemCount  int    `json:"item_count"`
	TotalCents any    `json:"total_cents"`
	CreatedAt  string `json:"created_at"`
}

type listResponse struct {
	Orders      []orderSummary `json:"orders"`
	GeneratedAt string         `json:"generated_at"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	var buf bytes.Buffer
	enc := json.NewEncoder(&buf)
	enc.SetEscapeHTML(false)
	if err := enc.Encode(v); err != nil {
		log.Printf("encode response: %v", err)
		status = http.StatusInternalServerError
		buf.Reset()
		buf.WriteString(`{"error":"internal error"}` + "\n")
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(bytes.TrimSuffix(buf.Bytes(), []byte("\n")))
}

type errorResponse struct {
	Error string `json:"error"`
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, errorResponse{Error: msg})
}

func (a *App) internalError(w http.ResponseWriter, what string, err error) {
	log.Printf("%s: %v", what, err)
	writeError(w, http.StatusInternalServerError, "internal error")
}

func (a *App) healthz(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, healthResponse{Status: "ok"})
}

func (a *App) catalog(w http.ResponseWriter, r *http.Request) {
	projects, err := a.Upstream.Catalog(r.Context())
	if err != nil {
		writeError(w, http.StatusBadGateway, "catalog unavailable")
		return
	}
	products := make([]product, 0, len(projects))
	for _, p := range projects {
		products = append(products, product{
			ProjectID:      p.ID,
			Name:           p.Name,
			Maturity:       p.Maturity,
			UnitPriceCents: PriceCents(p.Maturity),
		})
	}
	writeJSON(w, http.StatusOK, catalogResponse{Products: products, GeneratedAt: a.stamp()})
}

// orderRequest is a validated POST /orders body.
type orderRequest struct {
	Customer string
	Items    []requestItem
}

type requestItem struct {
	ProjectID string
	Quantity  int
}

// ParseOrderRequest validates a POST /orders body. It returns the exact error
// message of the contract, or "" when the body is valid.
func ParseOrderRequest(body []byte) (orderRequest, string) {
	var req orderRequest

	dec := json.NewDecoder(bytes.NewReader(body))
	dec.UseNumber()
	var doc any
	if err := dec.Decode(&doc); err != nil {
		return req, "invalid JSON body"
	}
	if _, err := dec.Token(); !errors.Is(err, io.EOF) {
		return req, "invalid JSON body"
	}
	obj, ok := doc.(map[string]any)
	if !ok {
		return req, "invalid JSON body"
	}

	customer, ok := obj["customer"].(string)
	if !ok || customer == "" {
		return req, "customer is required"
	}
	req.Customer = customer

	items, ok := obj["items"].([]any)
	if !ok || len(items) < 1 || len(items) > 10 {
		return req, "items must have 1 to 10 entries"
	}

	for _, raw := range items {
		item, _ := raw.(map[string]any)
		projectID, ok := item["project_id"].(string)
		if !ok || projectID == "" {
			return req, "project_id is required"
		}
		qty, ok := integerValue(item["quantity"])
		if !ok || qty < 1 || qty > 99 {
			return req, "quantity must be between 1 and 99"
		}
		req.Items = append(req.Items, requestItem{ProjectID: projectID, Quantity: qty})
	}
	return req, ""
}

// integerValue accepts JSON numbers without a fractional part: 2 and 2.0 are
// both 2, 1.5 is rejected.
func integerValue(v any) (int, bool) {
	n, ok := v.(json.Number)
	if !ok {
		return 0, false
	}
	f, err := strconv.ParseFloat(n.String(), 64)
	if err != nil || f != math.Trunc(f) || f < -1e9 || f > 1e9 {
		return 0, false
	}
	return int(f), true
}

func (a *App) createOrder(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}
	req, msg := ParseOrderRequest(body)
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}

	// One sequential upstream call per item, even when a project repeats.
	lines := make([]Line, 0, len(req.Items))
	total := 0
	for _, it := range req.Items {
		p, err := a.Upstream.Project(r.Context(), it.ProjectID)
		if errors.Is(err, errUnknownProject) {
			writeError(w, http.StatusUnprocessableEntity, "unknown project: "+it.ProjectID)
			return
		}
		if err != nil {
			writeError(w, http.StatusBadGateway, "catalog unavailable")
			return
		}
		price := PriceCents(p.Maturity)
		total += it.Quantity * price
		lines = append(lines, Line{ProjectID: it.ProjectID, Name: p.Name, Quantity: it.Quantity, UnitPriceCents: price})
	}

	id := uuid.NewString()
	createdAt, err := a.Store.CreateOrder(r.Context(), id, req.Customer, total, lines)
	if err != nil {
		a.internalError(w, "create order", err)
		return
	}
	writeJSON(w, http.StatusCreated, a.orderObject(id, req.Customer, "placed", lines, total, createdAt))
}

func (a *App) orderObject(id, customer, status string, lines []Line, total int, createdAt time.Time) orderResponse {
	return orderResponse{
		ID:          id,
		Customer:    customer,
		Status:      status,
		Items:       lines,
		TotalCents:  a.totalValue(total),
		CreatedAt:   FormatTime(createdAt),
		GeneratedAt: a.stamp(),
	}
}

// parseOrderID accepts only the canonical 8-4-4-4-12 form, in any case, and
// returns it lowercased. Braces, urn:uuid: and unhyphenated forms are not
// valid, and uuid.Parse only accepts the hyphenated form at 36 characters.
func parseOrderID(s string) (string, bool) {
	if len(s) != 36 {
		return "", false
	}
	u, err := uuid.Parse(s)
	if err != nil {
		return "", false
	}
	return u.String(), true
}

func (a *App) getOrder(w http.ResponseWriter, r *http.Request) {
	id, ok := parseOrderID(r.PathValue("id"))
	if !ok {
		writeError(w, http.StatusNotFound, "order not found")
		return
	}
	row, err := a.Store.GetOrder(r.Context(), id)
	if errors.Is(err, errOrderNotFound) {
		writeError(w, http.StatusNotFound, "order not found")
		return
	}
	if err != nil {
		a.internalError(w, "get order", err)
		return
	}
	lines, err := a.Store.GetLines(r.Context(), id)
	if err != nil {
		a.internalError(w, "get order lines", err)
		return
	}
	writeJSON(w, http.StatusOK, a.orderObject(row.ID, row.Customer, row.Status, lines, row.TotalCents, row.CreatedAt))
}

func (a *App) getStatus(w http.ResponseWriter, r *http.Request) {
	id, ok := parseOrderID(r.PathValue("id"))
	if !ok {
		writeError(w, http.StatusNotFound, "order not found")
		return
	}
	status, err := a.Store.OrderStatus(r.Context(), id)
	if errors.Is(err, errOrderNotFound) {
		writeError(w, http.StatusNotFound, "order not found")
		return
	}
	if err != nil {
		a.internalError(w, "order status", err)
		return
	}
	writeJSON(w, http.StatusOK, statusResponse{ID: id, Status: status, GeneratedAt: a.stamp()})
}

func (a *App) listOrders(w http.ResponseWriter, r *http.Request) {
	cutoff := a.Now().Add(-time.Hour)
	rows, err := a.recentOrders(r.Context(), cutoff)
	if err != nil {
		a.internalError(w, "list orders", err)
		return
	}
	orders := make([]orderSummary, 0, len(rows))
	for _, row := range rows {
		orders = append(orders, orderSummary{
			ID:         row.ID,
			Customer:   row.Customer,
			Status:     row.Status,
			ItemCount:  row.ItemCount,
			TotalCents: a.totalValue(row.TotalCents),
			CreatedAt:  FormatTime(row.CreatedAt),
		})
	}
	writeJSON(w, http.StatusOK, listResponse{Orders: orders, GeneratedAt: a.stamp()})
}

// recentOrders runs S6, or under APP_SLOW=1 the planted N+1: S5 then S4 per order.
func (a *App) recentOrders(ctx context.Context, cutoff time.Time) ([]OrderRow, error) {
	if !a.Slow {
		return a.Store.ListRecentWithCounts(ctx, cutoff)
	}
	rows, err := a.Store.ListRecent(ctx, cutoff)
	if err != nil {
		return nil, err
	}
	for i := range rows {
		lines, err := a.Store.GetLines(ctx, rows[i].ID)
		if err != nil {
			return nil, err
		}
		rows[i].ItemCount = len(lines)
	}
	return rows, nil
}
