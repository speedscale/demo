package main

// The showcase is an opt-in set of /showcase endpoints whose only job is to
// put every kind of MySQL traffic that proxymock web can display on the wire:
// multi-row, empty and multiple result sets, prepared statements with typed
// parameters, database errors, write outcomes, typed columns with NULLs and
// transactions that commit and roll back.
//
// It is off unless SHOWCASE is set, so the default app sends exactly the same
// queries it always has. The showcase uses its own connection pool, opened
// with multiStatements=true so one COM_QUERY can return two result sets; the
// default pool keeps the driver's defaults, so its handshake is unchanged.

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"math"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/go-sql-driver/mysql"
)

// More MySQL error numbers, for the errors only the showcase provokes.
const (
	errParse          = 1064 // ER_PARSE_ERROR: SQL syntax error
	errCheckViolation = 3819 // ER_CHECK_CONSTRAINT_VIOLATED
)

// showcaseEnabled reports whether SHOWCASE asks for the showcase endpoints.
func showcaseEnabled() bool {
	switch strings.ToLower(os.Getenv("SHOWCASE")) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}

var showcaseDB *sql.DB

// setupShowcase opens the showcase connection pool, creates and seeds the
// showcase tables and registers the /showcase routes.
func setupShowcase(ctx context.Context, mux *http.ServeMux) error {
	cfg, err := mysql.ParseDSN(dsn())
	if err != nil {
		return err
	}
	cfg.MultiStatements = true
	if showcaseDB, err = sql.Open("mysql", cfg.FormatDSN()); err != nil {
		return err
	}
	if err := createShowcaseSchema(ctx); err != nil {
		return fmt.Errorf("create showcase schema: %w", err)
	}
	if err := resetShowcase(ctx); err != nil {
		return fmt.Errorf("seed showcase: %w", err)
	}

	mux.HandleFunc("POST /showcase/reset", showcaseResetHandler)
	mux.HandleFunc("GET /showcase/customers", showcaseListCustomersHandler)
	mux.HandleFunc("POST /showcase/customers", showcaseCreateCustomerHandler)
	mux.HandleFunc("GET /showcase/customers/{id}/summary", showcaseSummaryHandler)
	mux.HandleFunc("DELETE /showcase/customers/{id}", showcaseDeleteCustomerHandler)
	mux.HandleFunc("GET /showcase/products", showcaseProductsHandler)
	mux.HandleFunc("POST /showcase/products/reprice", showcaseRepriceHandler)
	mux.HandleFunc("POST /showcase/orders", showcaseCreateOrderHandler)
	mux.HandleFunc("GET /showcase/report", showcaseReportHandler)
	mux.HandleFunc("GET /showcase/bad-query", showcaseBadQueryHandler)
	log.Println("showcase endpoints enabled under /showcase")
	return nil
}

// Three related tables, orders referencing both customers and products. The
// columns cover the types the result-set view has to render: DECIMAL,
// BOOLEAN, BLOB, DATETIME and nullable VARCHAR.
func createShowcaseSchema(ctx context.Context) error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS showcase_customers (
			id           INT AUTO_INCREMENT PRIMARY KEY,
			email        VARCHAR(100) NOT NULL UNIQUE,
			name         VARCHAR(100) NOT NULL,
			nickname     VARCHAR(50),
			credit_limit DECIMAL(10,2) NOT NULL,
			is_vip       BOOLEAN NOT NULL DEFAULT FALSE,
			avatar       BLOB,
			created_at   DATETIME NOT NULL,
			CONSTRAINT showcase_customers_credit_limit_check CHECK (credit_limit >= 0)
		)`,
		`CREATE TABLE IF NOT EXISTS showcase_products (
			id           INT AUTO_INCREMENT PRIMARY KEY,
			sku          VARCHAR(20)  NOT NULL UNIQUE,
			name         VARCHAR(100) NOT NULL,
			price        DECIMAL(10,2) NOT NULL,
			discontinued BOOLEAN NOT NULL DEFAULT FALSE,
			CONSTRAINT showcase_products_price_check CHECK (price > 0)
		)`,
		`CREATE TABLE IF NOT EXISTS showcase_orders (
			id          INT AUTO_INCREMENT PRIMARY KEY,
			customer_id INT NOT NULL,
			product_id  INT NOT NULL,
			quantity    INT NOT NULL,
			total       DECIMAL(10,2) NOT NULL,
			note        VARCHAR(200),
			shipped_at  DATETIME,
			receipt     BLOB,
			CONSTRAINT showcase_orders_quantity_check CHECK (quantity > 0),
			FOREIGN KEY (customer_id) REFERENCES showcase_customers(id) ON DELETE CASCADE,
			FOREIGN KEY (product_id) REFERENCES showcase_products(id)
		)`,
	}
	for _, s := range stmts {
		if _, err := showcaseDB.ExecContext(ctx, s); err != nil {
			return err
		}
	}
	return nil
}

// resetShowcase empties the showcase tables, which also restarts their
// AUTO_INCREMENT counters, and reloads the seed rows, so every run of the
// traffic script sees the same ids and hits the same errors. TRUNCATE on a
// table that other tables reference needs foreign key checks off, and that is
// a session setting, so everything runs on one connection.
func resetShowcase(ctx context.Context) error {
	conn, err := showcaseDB.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close()

	stmts := []string{
		`SET FOREIGN_KEY_CHECKS = 0`,
		`TRUNCATE TABLE showcase_orders`,
		`TRUNCATE TABLE showcase_products`,
		`TRUNCATE TABLE showcase_customers`,
		`SET FOREIGN_KEY_CHECKS = 1`,
		`INSERT INTO showcase_customers (email, name, nickname, credit_limit, is_vip, avatar, created_at) VALUES
			('ada@example.com',    'Ada Lovelace',    'ada',  2500.00, TRUE,  X'89504E47', '2024-01-15 09:30:00'),
			('grace@example.com',  'Grace Hopper',    NULL,   1200.50, FALSE, NULL,        '2024-03-02 14:00:00'),
			('alan@example.com',   'Alan Turing',     'prof',    0.00, FALSE, X'CAFE',     '2024-06-30 23:59:59'),
			('edsger@example.com', 'Edsger Dijkstra', NULL,    800.00, TRUE,  NULL,        '2025-02-11 08:15:00')`,
		`INSERT INTO showcase_products (sku, name, price, discontinued) VALUES
			('TEE-BLK', 'Black tee',  19.99, FALSE),
			('TEE-WHT', 'White tee',  18.50, FALSE),
			('MUG-001', 'Coffee mug',  9.25, TRUE)`,
		`INSERT INTO showcase_orders (customer_id, product_id, quantity, total, note, shipped_at, receipt) VALUES
			(1, 1, 2, 39.98, 'gift wrap', '2025-05-01 10:00:00', X'01'),
			(1, 3, 1,  9.25, NULL,        NULL,                  NULL),
			(2, 2, 3, 55.50, NULL,        '2025-05-03 12:00:00', NULL)`,
	}
	for _, s := range stmts {
		// No arguments, so each one is a plain text-protocol COM_QUERY.
		if _, err := conn.ExecContext(ctx, s); err != nil {
			return err
		}
	}
	return nil
}

func showcaseResetHandler(w http.ResponseWriter, r *http.Request) {
	if err := resetShowcase(r.Context()); err != nil {
		showcaseDBError(w, "reset", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "reset"})
}

type showcaseCustomer struct {
	ID          int64       `json:"id"`
	Email       string      `json:"email"`
	Name        string      `json:"name"`
	Nickname    *string     `json:"nickname"`
	CreditLimit json.Number `json:"credit_limit"`
	IsVIP       bool        `json:"is_vip"`
	Avatar      []byte      `json:"avatar"`
	CreatedAt   time.Time   `json:"created_at"`
}

// showcaseListCustomersHandler has no arguments, so the driver sends it as a
// text-protocol COM_QUERY. The rows include NULL nickname and avatar values
// alongside DECIMAL, BOOLEAN, BLOB and DATETIME columns.
func showcaseListCustomersHandler(w http.ResponseWriter, r *http.Request) {
	rows, err := showcaseDB.QueryContext(r.Context(),
		`SELECT id, email, name, nickname, credit_limit, is_vip, avatar, created_at
		 FROM showcase_customers ORDER BY id`)
	if err != nil {
		showcaseDBError(w, "list customers", err)
		return
	}
	defer rows.Close()

	out := []showcaseCustomer{}
	for rows.Next() {
		var (
			c     showcaseCustomer
			nick  sql.NullString
			limit string
		)
		if err := rows.Scan(&c.ID, &c.Email, &c.Name, &nick, &limit, &c.IsVIP, &c.Avatar, &c.CreatedAt); err != nil {
			showcaseDBError(w, "scan customer", err)
			return
		}
		if nick.Valid {
			c.Nickname = &nick.String
		}
		c.CreditLimit = json.Number(limit)
		out = append(out, c)
	}
	if err := rows.Err(); err != nil {
		showcaseDBError(w, "list customers", err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// showcaseSummaryHandler returns the customer and then their orders as two
// result sets from one COM_QUERY. Multi-statement queries cannot be prepared,
// so the id, already parsed as an integer, is written into the SQL text.
//
// A stored procedure CALL would also return several result sets, but its
// response ends with an extra OK packet that proxymock's MySQL dissector
// currently misreads, which corrupts the rest of that connection's recording.
func showcaseSummaryHandler(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	idText := strconv.FormatInt(id, 10)
	rows, err := showcaseDB.QueryContext(r.Context(),
		`SELECT id, email, name, credit_limit, is_vip FROM showcase_customers WHERE id = `+idText+`;
		 SELECT id, product_id, quantity, total, shipped_at FROM showcase_orders WHERE customer_id = `+idText+` ORDER BY id`)
	if err != nil {
		showcaseDBError(w, "customer summary", err)
		return
	}
	defer rows.Close()

	type customer struct {
		ID          int64       `json:"id"`
		Email       string      `json:"email"`
		Name        string      `json:"name"`
		CreditLimit json.Number `json:"credit_limit"`
		IsVIP       bool        `json:"is_vip"`
	}
	type order struct {
		ID        int64       `json:"id"`
		ProductID int64       `json:"product_id"`
		Quantity  int         `json:"quantity"`
		Total     json.Number `json:"total"`
		ShippedAt *time.Time  `json:"shipped_at"`
	}
	var (
		c      *customer
		orders = []order{}
	)
	// First result set: the customer row, if any.
	for rows.Next() {
		var (
			cu    customer
			limit string
		)
		if err := rows.Scan(&cu.ID, &cu.Email, &cu.Name, &limit, &cu.IsVIP); err != nil {
			showcaseDBError(w, "scan customer", err)
			return
		}
		cu.CreditLimit = json.Number(limit)
		c = &cu
	}
	// Second result set: their orders.
	if rows.NextResultSet() {
		for rows.Next() {
			var (
				o       order
				total   string
				shipped sql.NullTime
			)
			if err := rows.Scan(&o.ID, &o.ProductID, &o.Quantity, &total, &shipped); err != nil {
				showcaseDBError(w, "scan order", err)
				return
			}
			o.Total = json.Number(total)
			if shipped.Valid {
				o.ShippedAt = &shipped.Time
			}
			orders = append(orders, o)
		}
	}
	if err := rows.Err(); err != nil {
		showcaseDBError(w, "customer summary", err)
		return
	}
	if c == nil {
		writeError(w, http.StatusNotFound, "customer not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"customer": c, "orders": orders})
}

// showcaseCreateCustomerHandler inserts a customer and returns the
// AUTO_INCREMENT id. The prepared statement binds string, NULL, DOUBLE,
// TINY (boolean), BLOB and DATETIME parameters. A duplicate email is error
// 1062 (409) and a negative credit limit is error 3819 (422).
func showcaseCreateCustomerHandler(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email       string     `json:"email"`
		Name        string     `json:"name"`
		Nickname    *string    `json:"nickname"`
		CreditLimit float64    `json:"credit_limit"`
		IsVIP       bool       `json:"is_vip"`
		Avatar      []byte     `json:"avatar"` // base64 in JSON
		CreatedAt   *time.Time `json:"created_at"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Email == "" || in.Name == "" {
		writeError(w, http.StatusBadRequest, "body must be JSON with email and name")
		return
	}
	createdAt := time.Date(2025, 9, 1, 12, 0, 0, 0, time.UTC)
	if in.CreatedAt != nil {
		createdAt = in.CreatedAt.UTC()
	}

	res, err := showcaseDB.ExecContext(r.Context(),
		`INSERT INTO showcase_customers (email, name, nickname, credit_limit, is_vip, avatar, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		in.Email, in.Name, in.Nickname, in.CreditLimit, in.IsVIP, in.Avatar, createdAt)
	if err != nil {
		showcaseDBError(w, "create customer", err)
		return
	}
	id, err := res.LastInsertId()
	if err != nil {
		showcaseDBError(w, "create customer", err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}

// showcaseDeleteCustomerHandler deletes a customer; ON DELETE CASCADE takes
// their orders too.
func showcaseDeleteCustomerHandler(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	res, err := showcaseDB.ExecContext(r.Context(), `DELETE FROM showcase_customers WHERE id = ?`, id)
	if err != nil {
		showcaseDBError(w, "delete customer", err)
		return
	}
	if n, err := res.RowsAffected(); err != nil || n == 0 {
		writeError(w, http.StatusNotFound, "customer not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// showcaseProductsHandler filters products by a minimum price, bound as a
// DOUBLE parameter. A low minimum returns several rows and a high one returns
// an empty result set that still carries its column definitions.
func showcaseProductsHandler(w http.ResponseWriter, r *http.Request) {
	minPrice := 0.0
	if v := r.URL.Query().Get("min_price"); v != "" {
		f, err := strconv.ParseFloat(v, 64)
		if err != nil {
			writeError(w, http.StatusBadRequest, "min_price must be a number")
			return
		}
		minPrice = f
	}
	rows, err := showcaseDB.QueryContext(r.Context(),
		`SELECT id, sku, name, price, discontinued
		 FROM showcase_products WHERE price >= ? ORDER BY id`, minPrice)
	if err != nil {
		showcaseDBError(w, "list products", err)
		return
	}
	defer rows.Close()

	type product struct {
		ID           int64       `json:"id"`
		SKU          string      `json:"sku"`
		Name         string      `json:"name"`
		Price        json.Number `json:"price"`
		Discontinued bool        `json:"discontinued"`
	}
	out := []product{}
	for rows.Next() {
		var (
			p     product
			price string
		)
		if err := rows.Scan(&p.ID, &p.SKU, &p.Name, &price, &p.Discontinued); err != nil {
			showcaseDBError(w, "scan product", err)
			return
		}
		p.Price = json.Number(price)
		out = append(out, p)
	}
	if err := rows.Err(); err != nil {
		showcaseDBError(w, "list products", err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

// showcaseRepriceHandler multiplies the price of every product whose SKU
// starts with a prefix. "TEE-" updates several rows and an unknown prefix
// updates none; both are OK packets with different affected-row counts.
func showcaseRepriceHandler(w http.ResponseWriter, r *http.Request) {
	var in struct {
		SKUPrefix string  `json:"sku_prefix"`
		Factor    float64 `json:"factor"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.SKUPrefix == "" {
		writeError(w, http.StatusBadRequest, "body must be JSON with sku_prefix and factor")
		return
	}
	res, err := showcaseDB.ExecContext(r.Context(),
		`UPDATE showcase_products SET price = ROUND(price * ?, 2) WHERE sku LIKE CONCAT(?, '%')`,
		in.Factor, in.SKUPrefix)
	if err != nil {
		showcaseDBError(w, "reprice", err)
		return
	}
	n, err := res.RowsAffected()
	if err != nil {
		showcaseDBError(w, "reprice", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"updated": n})
}

// showcaseCreateOrderHandler places an order in an explicit transaction:
// look up the price, then insert the order. It COMMITs, unless dry_run is
// set, in which case it runs the same statements and then ROLLs BACK. A
// missing customer is error 1452 (422), which also rolls the transaction back.
func showcaseCreateOrderHandler(w http.ResponseWriter, r *http.Request) {
	var in struct {
		CustomerID int64   `json:"customer_id"`
		ProductID  int64   `json:"product_id"`
		Quantity   int     `json:"quantity"`
		Note       *string `json:"note"`
		Receipt    []byte  `json:"receipt"` // base64 in JSON
		DryRun     bool    `json:"dry_run"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	ctx := r.Context()

	tx, err := showcaseDB.BeginTx(ctx, nil)
	if err != nil {
		showcaseDBError(w, "begin", err)
		return
	}
	// Rollback after Commit is a no-op, so this covers every early return.
	defer tx.Rollback() //nolint:errcheck

	var price float64
	err = tx.QueryRowContext(ctx, `SELECT price FROM showcase_products WHERE id = ?`, in.ProductID).Scan(&price)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "product not found")
		return
	}
	if err != nil {
		showcaseDBError(w, "look up price", err)
		return
	}
	total := math.Round(price*float64(in.Quantity)*100) / 100

	// shipped_at is bound as NULL: a new order has not shipped.
	res, err := tx.ExecContext(ctx,
		`INSERT INTO showcase_orders (customer_id, product_id, quantity, total, note, shipped_at, receipt)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		in.CustomerID, in.ProductID, in.Quantity, total, in.Note, nil, in.Receipt)
	if err != nil {
		showcaseDBError(w, "create order", err)
		return
	}
	id, err := res.LastInsertId()
	if err != nil {
		showcaseDBError(w, "create order", err)
		return
	}

	if in.DryRun {
		if err := tx.Rollback(); err != nil {
			showcaseDBError(w, "rollback", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"dry_run": true, "total": total})
		return
	}
	if err := tx.Commit(); err != nil {
		showcaseDBError(w, "commit", err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": id, "total": total})
}

// showcaseReportHandler is a deliberate N+1: one query lists the customers,
// then one more query per customer totals their orders.
func showcaseReportHandler(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	rows, err := showcaseDB.QueryContext(ctx, `SELECT id, name FROM showcase_customers ORDER BY id`)
	if err != nil {
		showcaseDBError(w, "list customers", err)
		return
	}
	type line struct {
		ID     int64       `json:"id"`
		Name   string      `json:"name"`
		Orders int64       `json:"orders"`
		Spent  json.Number `json:"spent"`
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
		var spent string
		err := showcaseDB.QueryRowContext(ctx,
			`SELECT COUNT(*), COALESCE(SUM(total), 0) FROM showcase_orders WHERE customer_id = ?`,
			report[i].ID).Scan(&report[i].Orders, &spent)
		if err != nil {
			showcaseDBError(w, "total orders", err)
			return
		}
		report[i].Spent = json.Number(spent)
	}
	writeJSON(w, http.StatusOK, report)
}

// showcaseBadQueryHandler sends SQL with a syntax error on purpose, and
// MySQL answers with error 1064.
func showcaseBadQueryHandler(w http.ResponseWriter, r *http.Request) {
	_, err := showcaseDB.ExecContext(r.Context(), `SELECT id, FROM showcase_customers`)
	showcaseDBError(w, "bad query", err)
}

// showcaseDBError maps MySQL errors to 4xx JSON responses and anything else
// to a 500, so an expected database error never crashes the app.
func showcaseDBError(w http.ResponseWriter, what string, err error) {
	var me *mysql.MySQLError
	if !errors.As(err, &me) {
		serverError(w, what, err)
		return
	}
	status := http.StatusInternalServerError
	switch me.Number {
	case errDuplicateEntry:
		status = http.StatusConflict
	case errNoReferenced, errCheckViolation:
		status = http.StatusUnprocessableEntity
	case errParse:
		status = http.StatusBadRequest
	}
	writeJSON(w, status, map[string]any{
		"error":    what + " failed",
		"number":   me.Number,
		"sqlstate": string(me.SQLState[:]),
		"message":  me.Message,
	})
}
