package main

// The showcase is an opt-in set of /showcase endpoints whose only job is to
// put every kind of Postgres traffic that proxymock web can display on the
// wire: multi-row and empty result sets, bound statements with binary
// parameters, database errors, write outcomes, typed columns with NULLs and
// transactions that commit and roll back.
//
// It is off unless SHOWCASE is set, so the default app sends exactly the same
// queries it always has. It uses pgx rather than lib/pq on purpose: pgx
// prepares each statement, learns the parameter types, and then sends
// integer, numeric, timestamp and bytea parameters in Postgres's binary
// format, while lib/pq sends every parameter as text.

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gorilla/mux"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Postgres SQLSTATE codes the showcase turns into HTTP responses.
const (
	pgUniqueViolation     = "23505"
	pgForeignKeyViolation = "23503"
	pgCheckViolation      = "23514"
	pgSyntaxError         = "42601"
)

var showcaseDB *pgxpool.Pool

// showcaseEnabled reports whether SHOWCASE asks for the showcase endpoints.
func showcaseEnabled() bool {
	switch strings.ToLower(os.Getenv("SHOWCASE")) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}

// setupShowcase opens a pgx pool on the same database, creates the showcase
// tables and seeds them, then registers the /showcase routes.
func setupShowcase(ctx context.Context, connStr string, r *mux.Router) error {
	cfg, err := pgxpool.ParseConfig(connStr)
	if err != nil {
		return err
	}
	// pgxpool pings a connection it has not used for a second before handing
	// it out. Skip that so the recording only holds the showcase's queries.
	cfg.ShouldPing = func(context.Context, pgxpool.ShouldPingParams) bool { return false }
	showcaseDB, err = pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return err
	}
	if err := createShowcaseSchema(ctx); err != nil {
		return fmt.Errorf("create showcase schema: %w", err)
	}
	if err := resetShowcase(ctx); err != nil {
		return fmt.Errorf("seed showcase: %w", err)
	}

	s := r.PathPrefix("/showcase").Subrouter()
	s.HandleFunc("/reset", showcaseResetHandler).Methods("POST")
	s.HandleFunc("/customers", showcaseListCustomersHandler).Methods("GET")
	s.HandleFunc("/customers", showcaseCreateCustomerHandler).Methods("POST")
	s.HandleFunc("/customers/{id}", showcaseDeleteCustomerHandler).Methods("DELETE")
	s.HandleFunc("/products", showcaseProductsHandler).Methods("GET")
	s.HandleFunc("/products/reprice", showcaseRepriceHandler).Methods("POST")
	s.HandleFunc("/orders", showcaseCreateOrderHandler).Methods("POST")
	s.HandleFunc("/report", showcaseReportHandler).Methods("GET")
	s.HandleFunc("/bad-query", showcaseBadQueryHandler).Methods("GET")
	log.Println("showcase endpoints enabled under /showcase")
	return nil
}

// Three related tables: orders reference both customers and products. The
// columns cover the types the result-set view has to render: numeric,
// boolean, bytea, timestamptz and nullable text.
func createShowcaseSchema(ctx context.Context) error {
	_, err := showcaseDB.Exec(ctx, `
	CREATE TABLE IF NOT EXISTS showcase_customers (
		id           SERIAL PRIMARY KEY,
		email        TEXT NOT NULL UNIQUE,
		name         TEXT NOT NULL,
		nickname     TEXT,
		credit_limit NUMERIC(10,2) NOT NULL CHECK (credit_limit >= 0),
		is_vip       BOOLEAN NOT NULL DEFAULT false,
		avatar       BYTEA,
		created_at   TIMESTAMPTZ NOT NULL
	);
	CREATE TABLE IF NOT EXISTS showcase_products (
		id           SERIAL PRIMARY KEY,
		sku          TEXT NOT NULL UNIQUE,
		name         TEXT NOT NULL,
		price        NUMERIC(10,2) NOT NULL CHECK (price > 0),
		discontinued BOOLEAN NOT NULL DEFAULT false
	);
	CREATE TABLE IF NOT EXISTS showcase_orders (
		id          SERIAL PRIMARY KEY,
		customer_id INTEGER NOT NULL REFERENCES showcase_customers(id) ON DELETE CASCADE,
		product_id  INTEGER NOT NULL REFERENCES showcase_products(id),
		quantity    INTEGER NOT NULL CHECK (quantity > 0),
		total       NUMERIC(10,2) NOT NULL,
		note        TEXT,
		shipped_at  TIMESTAMPTZ,
		receipt     BYTEA
	)`)
	return err
}

// resetShowcase empties the showcase tables, restarts their id sequences and
// reloads the seed rows in one committed transaction, so every run of the
// traffic script sees the same ids and hits the same errors.
func resetShowcase(ctx context.Context) error {
	return pgx.BeginFunc(ctx, showcaseDB, func(tx pgx.Tx) error {
		stmts := []string{
			`TRUNCATE showcase_orders, showcase_products, showcase_customers RESTART IDENTITY`,
			`INSERT INTO showcase_customers (email, name, nickname, credit_limit, is_vip, avatar, created_at) VALUES
				('ada@example.com',    'Ada Lovelace',    'ada',  2500.00, true,  '\x89504e47', '2024-01-15 09:30:00+00'),
				('grace@example.com',  'Grace Hopper',    NULL,   1200.50, false, NULL,         '2024-03-02 14:00:00+00'),
				('alan@example.com',   'Alan Turing',     'prof',    0.00, false, '\xcafe',     '2024-06-30 23:59:59+00'),
				('edsger@example.com', 'Edsger Dijkstra', NULL,    800.00, true,  NULL,         '2025-02-11 08:15:00+00')`,
			`INSERT INTO showcase_products (sku, name, price, discontinued) VALUES
				('TEE-BLK', 'Black tee',  19.99, false),
				('TEE-WHT', 'White tee',  18.50, false),
				('MUG-001', 'Coffee mug',  9.25, true)`,
			`INSERT INTO showcase_orders (customer_id, product_id, quantity, total, note, shipped_at, receipt) VALUES
				(1, 1, 2, 39.98, 'gift wrap', '2025-05-01 10:00:00+00', '\x01'),
				(1, 3, 1,  9.25, NULL,        NULL,                     NULL),
				(2, 2, 3, 55.50, NULL,        '2025-05-03 12:00:00+00', NULL)`,
		}
		for _, s := range stmts {
			// No arguments, so the simple query protocol is enough.
			if _, err := tx.Exec(ctx, s, pgx.QueryExecModeSimpleProtocol); err != nil {
				return err
			}
		}
		return nil
	})
}

func showcaseResetHandler(w http.ResponseWriter, r *http.Request) {
	if err := resetShowcase(r.Context()); err != nil {
		showcaseDBError(w, "reset", err)
		return
	}
	showcaseJSON(w, http.StatusOK, map[string]string{"status": "reset"})
}

// showcaseListCustomersHandler lists customers with the simple query
// protocol, so the response carries a RowDescription with column names and
// text-format values: NULL nickname and avatar, numeric, boolean, bytea and
// timestamptz columns. With ?created_after= in the future it returns an empty
// result set that still has its columns; pgx writes the timestamp into the SQL
// text itself, since the simple protocol has no bound parameters.
func showcaseListCustomersHandler(w http.ResponseWriter, r *http.Request) {
	after := time.Unix(0, 0).UTC()
	if v := r.URL.Query().Get("created_after"); v != "" {
		t, err := time.Parse(time.RFC3339, v)
		if err != nil {
			showcaseJSON(w, http.StatusBadRequest, map[string]string{"error": "created_after must be an RFC 3339 timestamp"})
			return
		}
		after = t.UTC()
	}
	rows, err := showcaseDB.Query(r.Context(),
		`SELECT id, email, name, nickname, credit_limit, is_vip, avatar, created_at
		 FROM showcase_customers WHERE created_at > $1 ORDER BY id`, pgx.QueryExecModeSimpleProtocol, after)
	if err != nil {
		showcaseDBError(w, "list customers", err)
		return
	}
	type customer struct {
		ID          int32          `json:"id"`
		Email       string         `json:"email"`
		Name        string         `json:"name"`
		Nickname    *string        `json:"nickname"`
		CreditLimit pgtype.Numeric `json:"credit_limit"`
		IsVIP       bool           `json:"is_vip"`
		Avatar      []byte         `json:"avatar"`
		CreatedAt   time.Time      `json:"created_at"`
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByPos[customer])
	if err != nil {
		showcaseDBError(w, "list customers", err)
		return
	}
	showcaseJSON(w, http.StatusOK, out)
}

// showcaseCreateCustomerHandler inserts a customer and returns the generated
// id. The bound statement mixes text, numeric, boolean, bytea, timestamptz
// and NULL parameters. A duplicate email is a unique violation (409) and a
// negative credit limit breaks a CHECK constraint (422).
func showcaseCreateCustomerHandler(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email       string      `json:"email"`
		Name        string      `json:"name"`
		Nickname    *string     `json:"nickname"`
		CreditLimit json.Number `json:"credit_limit"`
		IsVIP       bool        `json:"is_vip"`
		Avatar      []byte      `json:"avatar"` // base64 in JSON
		CreatedAt   *time.Time  `json:"created_at"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Email == "" || in.Name == "" {
		showcaseJSON(w, http.StatusBadRequest, map[string]string{"error": "body must be JSON with email and name"})
		return
	}
	limit, ok := numericParam(w, "credit_limit", in.CreditLimit)
	if !ok {
		return
	}
	createdAt := time.Date(2025, 9, 1, 12, 0, 0, 0, time.UTC)
	if in.CreatedAt != nil {
		createdAt = in.CreatedAt.UTC()
	}

	var id int32
	err := showcaseDB.QueryRow(r.Context(),
		`INSERT INTO showcase_customers (email, name, nickname, credit_limit, is_vip, avatar, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 RETURNING id`,
		in.Email, in.Name, in.Nickname, limit, in.IsVIP, in.Avatar, createdAt).Scan(&id)
	if err != nil {
		showcaseDBError(w, "create customer", err)
		return
	}
	showcaseJSON(w, http.StatusCreated, map[string]any{"id": id})
}

// showcaseDeleteCustomerHandler deletes a customer; ON DELETE CASCADE takes
// their orders too.
func showcaseDeleteCustomerHandler(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.Atoi(mux.Vars(r)["id"])
	if err != nil {
		showcaseJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid id"})
		return
	}
	tag, err := showcaseDB.Exec(r.Context(), `DELETE FROM showcase_customers WHERE id = $1`, int32(id))
	if err != nil {
		showcaseDBError(w, "delete customer", err)
		return
	}
	if tag.RowsAffected() == 0 {
		showcaseJSON(w, http.StatusNotFound, map[string]string{"error": "customer not found"})
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// showcaseProductsHandler filters products by a minimum price, sent as a
// binary numeric parameter. A low minimum returns several rows and a high one
// returns an empty result set.
func showcaseProductsHandler(w http.ResponseWriter, r *http.Request) {
	minPrice := r.URL.Query().Get("min_price")
	if minPrice == "" {
		minPrice = "0"
	}
	price, ok := numericParam(w, "min_price", json.Number(minPrice))
	if !ok {
		return
	}
	rows, err := showcaseDB.Query(r.Context(),
		`SELECT id, sku, name, price, discontinued
		 FROM showcase_products WHERE price >= $1 ORDER BY id`, price)
	if err != nil {
		showcaseDBError(w, "list products", err)
		return
	}
	type product struct {
		ID           int32          `json:"id"`
		SKU          string         `json:"sku"`
		Name         string         `json:"name"`
		Price        pgtype.Numeric `json:"price"`
		Discontinued bool           `json:"discontinued"`
	}
	out, err := pgx.CollectRows(rows, pgx.RowToStructByPos[product])
	if err != nil {
		showcaseDBError(w, "list products", err)
		return
	}
	showcaseJSON(w, http.StatusOK, out)
}

// showcaseRepriceHandler multiplies the price of every product whose SKU
// starts with a prefix. "TEE-" updates several rows and an unknown prefix
// updates none; both are successful commands with different row counts.
func showcaseRepriceHandler(w http.ResponseWriter, r *http.Request) {
	var in struct {
		SKUPrefix string      `json:"sku_prefix"`
		Factor    json.Number `json:"factor"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.SKUPrefix == "" {
		showcaseJSON(w, http.StatusBadRequest, map[string]string{"error": "body must be JSON with sku_prefix and factor"})
		return
	}
	factor, ok := numericParam(w, "factor", in.Factor)
	if !ok {
		return
	}
	tag, err := showcaseDB.Exec(r.Context(),
		`UPDATE showcase_products SET price = round(price * $1, 2) WHERE sku LIKE $2 || '%'`,
		factor, in.SKUPrefix)
	if err != nil {
		showcaseDBError(w, "reprice", err)
		return
	}
	showcaseJSON(w, http.StatusOK, map[string]any{"updated": tag.RowsAffected()})
}

// showcaseCreateOrderHandler places an order in an explicit transaction:
// look up the price, insert the order and return its id. It COMMITs, unless
// dry_run is set, in which case it runs the same statements and then ROLLs
// BACK. A missing customer is a foreign key violation (422), which also rolls
// the transaction back.
func showcaseCreateOrderHandler(w http.ResponseWriter, r *http.Request) {
	var in struct {
		CustomerID int32   `json:"customer_id"`
		ProductID  int32   `json:"product_id"`
		Quantity   int32   `json:"quantity"`
		Note       *string `json:"note"`
		Receipt    []byte  `json:"receipt"` // base64 in JSON
		DryRun     bool    `json:"dry_run"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		showcaseJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
		return
	}
	ctx := r.Context()

	tx, err := showcaseDB.Begin(ctx)
	if err != nil {
		showcaseDBError(w, "begin", err)
		return
	}
	// Rollback after Commit is a no-op, so this covers every early return.
	defer tx.Rollback(ctx) //nolint:errcheck

	var price pgtype.Numeric
	err = tx.QueryRow(ctx, `SELECT price FROM showcase_products WHERE id = $1`, in.ProductID).Scan(&price)
	if errors.Is(err, pgx.ErrNoRows) {
		showcaseJSON(w, http.StatusNotFound, map[string]string{"error": "product not found"})
		return
	}
	if err != nil {
		showcaseDBError(w, "look up price", err)
		return
	}

	var (
		id    int32
		total pgtype.Numeric
	)
	err = tx.QueryRow(ctx,
		`INSERT INTO showcase_orders (customer_id, product_id, quantity, total, note, shipped_at, receipt)
		 VALUES ($1, $2, $3, $4::numeric * $3::integer, $5, $6, $7)
		 RETURNING id, total`,
		in.CustomerID, in.ProductID, in.Quantity, price, in.Note, pgtype.Timestamptz{}, in.Receipt).Scan(&id, &total)
	if err != nil {
		showcaseDBError(w, "create order", err)
		return
	}

	if in.DryRun {
		if err := tx.Rollback(ctx); err != nil {
			showcaseDBError(w, "rollback", err)
			return
		}
		showcaseJSON(w, http.StatusOK, map[string]any{"dry_run": true, "total": total})
		return
	}
	if err := tx.Commit(ctx); err != nil {
		showcaseDBError(w, "commit", err)
		return
	}
	showcaseJSON(w, http.StatusCreated, map[string]any{"id": id, "total": total})
}

// showcaseReportHandler is a deliberate N+1: one query lists the customers,
// then one more query per customer totals their orders.
func showcaseReportHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	rows, err := showcaseDB.Query(ctx, `SELECT id, name FROM showcase_customers ORDER BY id`)
	if err != nil {
		showcaseDBError(w, "list customers", err)
		return
	}
	type line struct {
		ID     int32          `json:"id"`
		Name   string         `json:"name"`
		Orders int64          `json:"orders"`
		Spent  pgtype.Numeric `json:"spent"`
	}
	var report []line
	for rows.Next() {
		var l line
		if err := rows.Scan(&l.ID, &l.Name); err != nil {
			rows.Close()
			showcaseDBError(w, "scan customer", err)
			return
		}
		report = append(report, l)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		showcaseDBError(w, "list customers", err)
		return
	}

	for i := range report {
		err := showcaseDB.QueryRow(ctx,
			`SELECT count(*), coalesce(sum(total), 0) FROM showcase_orders WHERE customer_id = $1`,
			report[i].ID).Scan(&report[i].Orders, &report[i].Spent)
		if err != nil {
			showcaseDBError(w, "total orders", err)
			return
		}
	}
	showcaseJSON(w, http.StatusOK, report)
}

// showcaseBadQueryHandler sends SQL with a syntax error on purpose. Postgres
// answers with SQLSTATE 42601 and the character position of the mistake.
func showcaseBadQueryHandler(w http.ResponseWriter, r *http.Request) {
	_, err := showcaseDB.Exec(r.Context(),
		`SELECT id, FROM showcase_customers`, pgx.QueryExecModeSimpleProtocol)
	showcaseDBError(w, "bad query", err)
}

// numericParam parses a JSON number into a pgtype.Numeric, which pgx sends as
// a binary NUMERIC parameter.
func numericParam(w http.ResponseWriter, field string, v json.Number) (pgtype.Numeric, bool) {
	var n pgtype.Numeric
	if v == "" {
		v = "0"
	}
	if err := n.Scan(string(v)); err != nil {
		showcaseJSON(w, http.StatusBadRequest, map[string]string{"error": field + " must be a number"})
		return n, false
	}
	return n, true
}

// showcaseDBError maps Postgres errors to 4xx JSON responses and anything
// else to a 500, so an expected database error never crashes the app.
func showcaseDBError(w http.ResponseWriter, what string, err error) {
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) {
		log.Printf("showcase %s: %v", what, err)
		showcaseJSON(w, http.StatusInternalServerError, map[string]string{"error": what + " failed"})
		return
	}
	status := http.StatusInternalServerError
	switch pgErr.Code {
	case pgUniqueViolation:
		status = http.StatusConflict
	case pgForeignKeyViolation, pgCheckViolation:
		status = http.StatusUnprocessableEntity
	case pgSyntaxError:
		status = http.StatusBadRequest
	}
	body := map[string]any{
		"error":      what + " failed",
		"sqlstate":   pgErr.Code,
		"message":    pgErr.Message,
		"constraint": pgErr.ConstraintName,
	}
	if pgErr.Position > 0 {
		body["position"] = pgErr.Position
	}
	showcaseJSON(w, status, body)
}

func showcaseJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("write response: %v", err)
	}
}
