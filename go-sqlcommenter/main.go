// go-sqlcommenter is a small orders API on Postgres that tags every SQL statement a request runs with a
// sqlcommenter comment carrying the request's W3C traceparent and route, so a recording can link each query to the
// request that ran it exactly instead of by timing.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type server struct {
	pool *pgxpool.Pool
	// prepared remembers the connections the product lookup is already prepared on; see getProduct.
	prepared sync.Map // *pgx.Conn -> struct{}
}

func main() {
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, databaseURL())
	if err != nil {
		log.Fatalf("connect: %v", err)
	}
	defer pool.Close()
	if err := waitForDatabase(ctx, pool); err != nil {
		log.Fatalf("database: %v", err)
	}
	if err := migrate(ctx, pool); err != nil {
		log.Fatalf("migrate: %v", err)
	}

	s := &server{pool: pool}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.health)
	s.handle(mux, "GET /products", s.listProducts)
	s.handle(mux, "GET /products/{id}", s.getProduct)
	s.handle(mux, "GET /orders/{id}", s.getOrder)
	s.handle(mux, "POST /orders", s.createOrder)
	s.handle(mux, "GET /reports/sales", s.salesReport)

	addr := ":" + envOr("PORT", "8080")
	log.Printf("listening on %s", addr)
	log.Fatal(http.ListenAndServe(addr, mux))
}

// databaseURL builds the connection string from the libpq environment variables, defaulting to the compose file's
// database. sslmode=disable keeps the traffic in clear text so proxymock can record it.
func databaseURL() string {
	if u := os.Getenv("DATABASE_URL"); u != "" {
		return u
	}
	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s?sslmode=disable&pool_max_conns=4",
		envOr("PGUSER", "demo"), envOr("PGPASSWORD", "demo"), envOr("PGHOST", "localhost"),
		envOr("PGPORT", "5432"), envOr("PGDATABASE", "shop"))
}

func envOr(name, def string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return def
}

func waitForDatabase(ctx context.Context, pool *pgxpool.Pool) error {
	var err error
	for range 30 {
		if err = pool.Ping(ctx); err == nil {
			return nil
		}
		time.Sleep(time.Second)
	}
	return err
}

// handle registers a handler that continues (or starts) the request's trace and tags its SQL with it and the route.
func (s *server) handle(mux *http.ServeMux, pattern string, h http.HandlerFunc) {
	route := routeOf(pattern)
	mux.HandleFunc(pattern, func(w http.ResponseWriter, r *http.Request) {
		tc := traceFromRequest(r)
		w.Header().Set("traceparent", tc.Traceparent())
		h(w, r.WithContext(withRequestTags(r.Context(), requestTags{Trace: tc, Route: route})))
	})
}

// routeOf drops the method from a ServeMux pattern: "GET /orders/{id}" is "/orders/{id}".
func routeOf(pattern string) string {
	for i := range pattern {
		if pattern[i] == '/' {
			return pattern[i:]
		}
	}
	return pattern
}

// health runs an untagged statement: health checks are rarely traced, and the recording shows that such a statement
// still links to its request by timing. It counts the catalog rather than running SELECT 1, which proxymock treats as
// a connection ping and does not record.
func (s *server) health(w http.ResponseWriter, r *http.Request) {
	var products int
	if err := s.pool.QueryRow(r.Context(), "SELECT count(*) FROM products").Scan(&products); err != nil {
		httpError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "products": products})
}

type product struct {
	ID    int     `json:"id"`
	Name  string  `json:"name"`
	Price float64 `json:"price"`
	Stock int     `json:"stock"`
}

func (s *server) listProducts(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(), tag(r.Context(), "SELECT id, name, price::float8, stock FROM products ORDER BY id"))
	if err != nil {
		httpError(w, err)
		return
	}
	products, err := pgx.CollectRows(rows, pgx.RowToStructByPos[product])
	if err != nil {
		httpError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, products)
}

// getProduct uses a named prepared statement that is prepared once per connection, by whichever request gets there
// first, and reused by every later request on that connection. This is what an ORM statement cache keyed on the
// uncommented SQL does, and it is the caveat of SQL comment tagging: the reused statement keeps the comment, and so
// the trace id, of the request that prepared it. The recording shows those executions falling back to timing.
func (s *server) getProduct(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	conn, err := s.pool.Acquire(r.Context())
	if err != nil {
		httpError(w, err)
		return
	}
	defer conn.Release()
	const name = "product_by_id"
	if _, done := s.prepared.Load(conn.Conn()); !done {
		if _, err := conn.Conn().Prepare(r.Context(), name,
			tag(r.Context(), "SELECT id, name, price::float8, stock FROM products WHERE id = $1")); err != nil {
			httpError(w, err)
			return
		}
		s.prepared.Store(conn.Conn(), struct{}{})
	}
	rows, err := conn.Query(r.Context(), name, id)
	if err != nil {
		httpError(w, err)
		return
	}
	p, err := pgx.CollectExactlyOneRow(rows, pgx.RowToStructByPos[product])
	if err != nil {
		httpError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, p)
}

type orderItem struct {
	ProductID int     `json:"product_id"`
	Quantity  int     `json:"quantity"`
	Price     float64 `json:"price,omitempty"`
}

type order struct {
	ID        int         `json:"id"`
	Customer  string      `json:"customer"`
	Total     float64     `json:"total"`
	CreatedAt time.Time   `json:"created_at"`
	Items     []orderItem `json:"items"`
}

func (s *server) getOrder(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	ctx := r.Context()
	var o order
	err := s.pool.QueryRow(ctx, tag(ctx, "SELECT id, customer, total::float8, created_at FROM orders WHERE id = $1"), id).
		Scan(&o.ID, &o.Customer, &o.Total, &o.CreatedAt)
	if err != nil {
		httpError(w, err)
		return
	}
	rows, err := s.pool.Query(ctx, tag(ctx, "SELECT product_id, quantity, price::float8 FROM order_items WHERE order_id = $1 ORDER BY product_id"), id)
	if err != nil {
		httpError(w, err)
		return
	}
	if o.Items, err = pgx.CollectRows(rows, pgx.RowToStructByPos[orderItem]); err != nil {
		httpError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, o)
}

type createOrderRequest struct {
	Customer string      `json:"customer"`
	Items    []orderItem `json:"items"`
}

// createOrder runs a transaction on one connection. Every statement in it, BEGIN and COMMIT included, carries the
// request's tags.
func (s *server) createOrder(w http.ResponseWriter, r *http.Request) {
	var req createOrderRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Customer == "" || len(req.Items) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "customer and items are required"})
		return
	}
	ctx := r.Context()
	conn, err := s.pool.Acquire(ctx)
	if err != nil {
		httpError(w, err)
		return
	}
	defer conn.Release()
	if _, err := conn.Exec(ctx, tag(ctx, "BEGIN")); err != nil {
		httpError(w, err)
		return
	}
	committed := false
	defer func() {
		if !committed {
			_, _ = conn.Exec(context.Background(), tag(ctx, "ROLLBACK"))
		}
	}()

	var orderID int
	if err := conn.QueryRow(ctx, tag(ctx, "INSERT INTO orders (customer, total) VALUES ($1, 0) RETURNING id"), req.Customer).Scan(&orderID); err != nil {
		httpError(w, err)
		return
	}
	for _, it := range req.Items {
		var price float64
		err := conn.QueryRow(ctx, tag(ctx, "UPDATE products SET stock = stock - $2 WHERE id = $1 AND stock >= $2 RETURNING price::float8"),
			it.ProductID, it.Quantity).Scan(&price)
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSON(w, http.StatusConflict, map[string]string{"error": fmt.Sprintf("product %d is unknown or out of stock", it.ProductID)})
			return
		}
		if err != nil {
			httpError(w, err)
			return
		}
		if _, err := conn.Exec(ctx, tag(ctx, "INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ($1, $2, $3, $4)"),
			orderID, it.ProductID, it.Quantity, price); err != nil {
			httpError(w, err)
			return
		}
	}
	if _, err := conn.Exec(ctx, tag(ctx, "UPDATE orders SET total = (SELECT sum(quantity * price) FROM order_items WHERE order_id = $1) WHERE id = $1"), orderID); err != nil {
		httpError(w, err)
		return
	}
	if _, err := conn.Exec(ctx, tag(ctx, "COMMIT")); err != nil {
		httpError(w, err)
		return
	}
	committed = true
	writeJSON(w, http.StatusCreated, map[string]int{"id": orderID})
}

type productSales struct {
	Product string  `json:"product"`
	Units   int     `json:"units"`
	Revenue float64 `json:"revenue"`
}

// salesReport is deliberately slow (a 200 ms pg_sleep) so that concurrent requests overlap, which is when linking by
// timing becomes a guess and the trace id in the comment decides.
func (s *server) salesReport(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	if _, err := s.pool.Exec(ctx, tag(ctx, "SELECT pg_sleep(0.2)")); err != nil {
		httpError(w, err)
		return
	}
	rows, err := s.pool.Query(ctx, tag(ctx, `SELECT p.name, coalesce(sum(i.quantity), 0)::int, coalesce(sum(i.quantity * i.price), 0)::float8
		FROM products p LEFT JOIN order_items i ON i.product_id = p.id GROUP BY p.name ORDER BY 3 DESC`))
	if err != nil {
		httpError(w, err)
		return
	}
	report, err := pgx.CollectRows(rows, pgx.RowToStructByPos[productSales])
	if err != nil {
		httpError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, report)
}

func pathID(w http.ResponseWriter, r *http.Request) (int, bool) {
	id, err := strconv.Atoi(r.PathValue("id"))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "id must be a number"})
		return 0, false
	}
	return id, true
}

func httpError(w http.ResponseWriter, err error) {
	if errors.Is(err, pgx.ErrNoRows) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "not found"})
		return
	}
	log.Printf("error: %v", err)
	writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// migrate creates the schema and seeds the catalog on first start. These statements run outside any request, so they
// are untagged.
func migrate(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, `
CREATE TABLE IF NOT EXISTS products (
	id    serial PRIMARY KEY,
	name  text NOT NULL UNIQUE,
	price numeric(10,2) NOT NULL,
	stock int NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
	id         serial PRIMARY KEY,
	customer   text NOT NULL,
	total      numeric(10,2) NOT NULL,
	created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS order_items (
	order_id   int NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
	product_id int NOT NULL REFERENCES products(id),
	quantity   int NOT NULL CHECK (quantity > 0),
	price      numeric(10,2) NOT NULL,
	PRIMARY KEY (order_id, product_id)
);
INSERT INTO products (name, price, stock) VALUES
	('Espresso beans 1kg', 24.50, 1000),
	('Pour-over kettle', 59.00, 1000),
	('Ceramic dripper', 18.75, 1000),
	('Paper filters (100)', 6.25, 1000),
	('Burr grinder', 129.00, 1000)
ON CONFLICT (name) DO NOTHING;
INSERT INTO orders (id, customer, total) VALUES (1, 'ada@example.com', 49.00)
ON CONFLICT (id) DO NOTHING;
INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (1, 1, 2, 24.50)
ON CONFLICT DO NOTHING;
SELECT setval('orders_id_seq', greatest((SELECT max(id) FROM orders), 1));`)
	return err
}
