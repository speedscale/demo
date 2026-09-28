// go-mysql is a small users and orders REST API backed by MySQL.
//
// It exists to give proxymock realistic MySQL traffic to record, mock and
// replay. Every parameterised query goes over the wire as a server-side
// prepared statement (COM_STMT_PREPARE plus COM_STMT_EXECUTE), /health uses
// the plain text protocol (COM_QUERY), and order creation runs inside an
// explicit transaction.
package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"
	"strconv"
	"time"

	"github.com/go-sql-driver/mysql"
)

// MySQL error numbers the handlers translate into HTTP status codes.
const (
	errDuplicateEntry = 1062 // ER_DUP_ENTRY: unique email or username taken
	errNoReferenced   = 1452 // ER_NO_REFERENCED_ROW_2: order for a missing user
)

type User struct {
	ID         int64  `json:"id"`
	FirstName  string `json:"first_name"`
	LastName   string `json:"last_name"`
	Email      string `json:"email"`
	Username   string `json:"username"`
	Age        int    `json:"age"`
	OrderCount int    `json:"order_count"`
}

type Order struct {
	ID        int64     `json:"id"`
	UserID    int64     `json:"user_id"`
	Total     float64   `json:"total"`
	CreatedAt time.Time `json:"created_at"`
}

var db *sql.DB

func main() {
	var err error
	db, err = sql.Open("mysql", dsn())
	if err != nil {
		log.Fatalf("invalid MySQL config: %v", err)
	}
	defer db.Close()

	if err := waitForDB(30 * time.Second); err != nil {
		log.Fatalf("MySQL not reachable: %v", err)
	}
	if err := createSchema(); err != nil {
		log.Fatalf("create schema: %v", err)
	}
	if err := seed(); err != nil {
		log.Fatalf("seed data: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", healthHandler)
	mux.HandleFunc("GET /users", listUsersHandler)
	mux.HandleFunc("POST /users", createUserHandler)
	mux.HandleFunc("GET /users/{id}", getUserHandler)
	mux.HandleFunc("PUT /users/{id}", updateUserHandler)
	mux.HandleFunc("DELETE /users/{id}", deleteUserHandler)
	mux.HandleFunc("POST /users/{id}/orders", createOrderHandler)
	mux.HandleFunc("GET /users/{id}/orders", listOrdersHandler)

	// The showcase is opt-in so the default app's database traffic is unchanged.
	if showcaseEnabled() {
		if err := setupShowcase(context.Background(), mux); err != nil {
			log.Fatalf("set up showcase: %v", err)
		}
	}

	srv := &http.Server{
		Addr:              ":8080",
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}
	log.Println("server listening on :8080")
	log.Fatal(srv.ListenAndServe())
}

// dsn builds the connection string from MYSQL_* environment variables.
// Only the port needs to change to route traffic through proxymock.
func dsn() string {
	cfg := mysql.NewConfig()
	cfg.User = env("MYSQL_USER", "demo")
	cfg.Passwd = env("MYSQL_PWD", "demo")
	cfg.Net = "tcp"
	cfg.Addr = net.JoinHostPort(env("MYSQL_HOST", "127.0.0.1"), env("MYSQL_PORT", "3306"))
	cfg.DBName = env("MYSQL_DATABASE", "app")
	cfg.ParseTime = true
	// false (the driver default) is the point of this demo: the driver sends
	// every query that has arguments as a server-side prepared statement
	// instead of splicing the values into the SQL text client-side.
	cfg.InterpolateParams = false
	// Plain TCP keeps the MySQL protocol readable by a recording proxy. The
	// driver fetches the server's RSA key itself when MySQL 8.4's
	// caching_sha2_password needs it for a first login without TLS.
	cfg.TLSConfig = "false"
	// Report matched rows rather than changed rows, so a PUT that repeats
	// the current values is not mistaken for a missing user.
	cfg.ClientFoundRows = true
	return cfg.FormatDSN()
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

// waitForDB retries the first connection because MySQL can take a while to
// accept logins after its container reports running.
func waitForDB(timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for {
		err := db.Ping()
		if err == nil {
			return nil
		}
		if time.Now().After(deadline) {
			return err
		}
		log.Printf("waiting for MySQL: %v", err)
		time.Sleep(time.Second)
	}
}

func createSchema() error {
	stmts := []string{
		`CREATE TABLE IF NOT EXISTS users (
			id          INT AUTO_INCREMENT PRIMARY KEY,
			first_name  VARCHAR(50)  NOT NULL,
			last_name   VARCHAR(50)  NOT NULL,
			email       VARCHAR(100) NOT NULL UNIQUE,
			username    VARCHAR(50)  NOT NULL UNIQUE,
			age         INT,
			order_count INT NOT NULL DEFAULT 0
		)`,
		`CREATE TABLE IF NOT EXISTS orders (
			id         INT AUTO_INCREMENT PRIMARY KEY,
			user_id    INT NOT NULL,
			total      DECIMAL(10,2) NOT NULL,
			created_at DATETIME NOT NULL,
			FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
		)`,
	}
	for _, s := range stmts {
		if _, err := db.Exec(s); err != nil {
			return err
		}
	}
	return nil
}

// seed only runs against an empty users table. INSERT IGNORE would also
// work, but InnoDB burns an AUTO_INCREMENT value on every ignored row, so
// ids would drift between restarts and break replay comparisons.
func seed() error {
	var n int
	if err := db.QueryRow("SELECT COUNT(*) FROM users").Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return nil
	}

	users := []User{
		{FirstName: "John", LastName: "Doe", Email: "john.doe@example.com", Username: "johndoe", Age: 30},
		{FirstName: "Jane", LastName: "Smith", Email: "jane.smith@example.com", Username: "janesmith", Age: 28},
		{FirstName: "Bob", LastName: "Johnson", Email: "bob.johnson@example.com", Username: "bobjohnson", Age: 35},
		{FirstName: "Alice", LastName: "Brown", Email: "alice.brown@example.com", Username: "alicebrown", Age: 32},
		{FirstName: "Charlie", LastName: "Wilson", Email: "charlie.wilson@example.com", Username: "charliewilson", Age: 29},
	}
	for i := range users {
		if err := insertUser(context.Background(), &users[i]); err != nil {
			return fmt.Errorf("seed user %s: %w", users[i].Email, err)
		}
	}
	// A couple of orders so GET /users/{id}/orders has something to show.
	for _, total := range []float64{19.99, 42.50} {
		if _, err := insertOrder(context.Background(), users[0].ID, total); err != nil {
			return fmt.Errorf("seed order: %w", err)
		}
	}
	log.Printf("seeded %d users", len(users))
	return nil
}

// healthHandler runs a query with no arguments, which the driver sends as a
// plain text-protocol COM_QUERY rather than a prepared statement.
func healthHandler(w http.ResponseWriter, r *http.Request) {
	var version string
	if err := db.QueryRowContext(r.Context(), "SELECT VERSION()").Scan(&version); err != nil {
		writeError(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "mysql_version": version})
}

func listUsersHandler(w http.ResponseWriter, r *http.Request) {
	limit := 100
	if v := r.URL.Query().Get("limit"); v != "" {
		n, err := strconv.Atoi(v)
		if err != nil || n < 1 {
			writeError(w, http.StatusBadRequest, "invalid limit")
			return
		}
		limit = n
	}

	rows, err := db.QueryContext(r.Context(),
		`SELECT id, first_name, last_name, email, username, age, order_count
		 FROM users ORDER BY id LIMIT ?`, limit)
	if err != nil {
		serverError(w, "list users", err)
		return
	}
	defer rows.Close()

	users := []User{}
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.FirstName, &u.LastName, &u.Email, &u.Username, &u.Age, &u.OrderCount); err != nil {
			serverError(w, "scan user", err)
			return
		}
		users = append(users, u)
	}
	if err := rows.Err(); err != nil {
		serverError(w, "list users", err)
		return
	}
	writeJSON(w, http.StatusOK, users)
}

func getUserHandler(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	u, err := getUser(r.Context(), id)
	if errors.Is(err, sql.ErrNoRows) {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if err != nil {
		serverError(w, "get user", err)
		return
	}
	writeJSON(w, http.StatusOK, u)
}

func getUser(ctx context.Context, id int64) (User, error) {
	var u User
	err := db.QueryRowContext(ctx,
		`SELECT id, first_name, last_name, email, username, age, order_count
		 FROM users WHERE id = ?`, id).
		Scan(&u.ID, &u.FirstName, &u.LastName, &u.Email, &u.Username, &u.Age, &u.OrderCount)
	return u, err
}

func createUserHandler(w http.ResponseWriter, r *http.Request) {
	u, ok := decodeUser(w, r)
	if !ok {
		return
	}
	err := insertUser(r.Context(), &u)
	if isMySQLError(err, errDuplicateEntry) {
		writeError(w, http.StatusConflict, "email or username already exists")
		return
	}
	if err != nil {
		serverError(w, "create user", err)
		return
	}
	writeJSON(w, http.StatusCreated, u)
}

func insertUser(ctx context.Context, u *User) error {
	res, err := db.ExecContext(ctx,
		`INSERT INTO users (first_name, last_name, email, username, age)
		 VALUES (?, ?, ?, ?, ?)`,
		u.FirstName, u.LastName, u.Email, u.Username, u.Age)
	if err != nil {
		return err
	}
	u.ID, err = res.LastInsertId()
	return err
}

func updateUserHandler(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	u, ok := decodeUser(w, r)
	if !ok {
		return
	}
	res, err := db.ExecContext(r.Context(),
		`UPDATE users SET first_name = ?, last_name = ?, email = ?, username = ?, age = ?
		 WHERE id = ?`,
		u.FirstName, u.LastName, u.Email, u.Username, u.Age, id)
	if isMySQLError(err, errDuplicateEntry) {
		writeError(w, http.StatusConflict, "email or username already exists")
		return
	}
	if err != nil {
		serverError(w, "update user", err)
		return
	}
	if n, err := res.RowsAffected(); err != nil || n == 0 {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	// Read the row back so the response carries order_count, which the
	// request body does not set.
	updated, err := getUser(r.Context(), id)
	if err != nil {
		serverError(w, "update user", err)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func deleteUserHandler(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	// orders.user_id has ON DELETE CASCADE, so the user's orders go too.
	res, err := db.ExecContext(r.Context(), "DELETE FROM users WHERE id = ?", id)
	if err != nil {
		serverError(w, "delete user", err)
		return
	}
	if n, err := res.RowsAffected(); err != nil || n == 0 {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func createOrderHandler(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	var in struct {
		Total float64 `json:"total"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil || in.Total <= 0 {
		writeError(w, http.StatusBadRequest, "body must be JSON with a positive total")
		return
	}

	o, err := insertOrder(r.Context(), id, in.Total)
	if isMySQLError(err, errNoReferenced) {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	if err != nil {
		serverError(w, "create order", err)
		return
	}
	writeJSON(w, http.StatusCreated, o)
}

// insertOrder writes the order and bumps users.order_count in one
// transaction, so the recording shows BEGIN, two prepared statements and
// COMMIT on the same connection, and the count can never drift from the
// orders table.
func insertOrder(ctx context.Context, userID int64, total float64) (Order, error) {
	o := Order{
		UserID: userID,
		Total:  total,
		// Sent as a DATETIME parameter rather than a column default, so the
		// prepared statement carries a temporal value in the binary protocol.
		CreatedAt: time.Now().UTC().Truncate(time.Second),
	}

	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return o, err
	}
	// Rollback after a successful Commit is a no-op, so this covers every
	// early return.
	defer tx.Rollback()

	res, err := tx.ExecContext(ctx,
		"INSERT INTO orders (user_id, total, created_at) VALUES (?, ?, ?)",
		o.UserID, o.Total, o.CreatedAt)
	if err != nil {
		return o, err
	}
	if o.ID, err = res.LastInsertId(); err != nil {
		return o, err
	}
	if _, err := tx.ExecContext(ctx,
		"UPDATE users SET order_count = order_count + 1 WHERE id = ?", userID); err != nil {
		return o, err
	}
	return o, tx.Commit()
}

// listOrdersHandler LEFT JOINs from users so that a user with no orders
// returns an empty list while a missing user returns 404, in one query.
func listOrdersHandler(w http.ResponseWriter, r *http.Request) {
	id, ok := pathID(w, r)
	if !ok {
		return
	}
	rows, err := db.QueryContext(r.Context(),
		`SELECT o.id, o.total, o.created_at
		 FROM users u LEFT JOIN orders o ON o.user_id = u.id
		 WHERE u.id = ? ORDER BY o.id`, id)
	if err != nil {
		serverError(w, "list orders", err)
		return
	}
	defer rows.Close()

	found := false
	orders := []Order{}
	for rows.Next() {
		found = true
		var (
			orderID   sql.NullInt64
			total     sql.NullFloat64
			createdAt sql.NullTime
		)
		if err := rows.Scan(&orderID, &total, &createdAt); err != nil {
			serverError(w, "scan order", err)
			return
		}
		if !orderID.Valid {
			continue // the user row with no matching orders
		}
		orders = append(orders, Order{ID: orderID.Int64, UserID: id, Total: total.Float64, CreatedAt: createdAt.Time})
	}
	if err := rows.Err(); err != nil {
		serverError(w, "list orders", err)
		return
	}
	if !found {
		writeError(w, http.StatusNotFound, "user not found")
		return
	}
	writeJSON(w, http.StatusOK, orders)
}

func decodeUser(w http.ResponseWriter, r *http.Request) (User, bool) {
	var u User
	if err := json.NewDecoder(r.Body).Decode(&u); err != nil {
		writeError(w, http.StatusBadRequest, "invalid JSON")
		return u, false
	}
	if u.FirstName == "" || u.LastName == "" || u.Email == "" || u.Username == "" {
		writeError(w, http.StatusBadRequest, "first_name, last_name, email and username are required")
		return u, false
	}
	return u, true
}

func pathID(w http.ResponseWriter, r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil || id < 1 {
		writeError(w, http.StatusBadRequest, "invalid user id")
		return 0, false
	}
	return id, true
}

func isMySQLError(err error, number uint16) bool {
	var me *mysql.MySQLError
	return errors.As(err, &me) && me.Number == number
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		log.Printf("write response: %v", err)
	}
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// serverError logs the real cause but keeps driver details out of the
// response body.
func serverError(w http.ResponseWriter, what string, err error) {
	log.Printf("%s: %v", what, err)
	writeError(w, http.StatusInternalServerError, what+" failed")
}
