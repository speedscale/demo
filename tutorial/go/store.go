package main

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

// The SQL below is the contract text, character for character.
const (
	sqlCreateOrder     = `INSERT INTO orders (id, customer, status, total_cents) VALUES ($1::uuid, $2, 'placed', $3) RETURNING created_at`
	sqlCreateOrderLine = `INSERT INTO order_items (order_id, project_id, name, quantity, unit_price_cents) VALUES ($1::uuid, $2, $3, $4, $5)`
	sqlGetOrder        = `SELECT id, customer, status, total_cents, created_at FROM orders WHERE id = $1::uuid`
	sqlGetOrderLines   = `SELECT project_id, name, quantity, unit_price_cents FROM order_items WHERE order_id = $1::uuid ORDER BY id`
	sqlListRecent      = `SELECT id, customer, status, total_cents, created_at FROM orders WHERE created_at > $1::timestamptz ORDER BY created_at DESC LIMIT 50`
	sqlListRecentCount = `SELECT o.id, o.customer, o.status, o.total_cents, o.created_at, COUNT(i.id) AS item_count FROM orders o LEFT JOIN order_items i ON i.order_id = o.id WHERE o.created_at > $1::timestamptz GROUP BY o.id ORDER BY o.created_at DESC LIMIT 50`
	sqlOrderStatus     = `SELECT status FROM orders WHERE id = $1::uuid`
)

var errOrderNotFound = errors.New("order not found")

// Line is one order line.
type Line struct {
	ProjectID      string `json:"project_id"`
	Name           string `json:"name"`
	Quantity       int    `json:"quantity"`
	UnitPriceCents int    `json:"unit_price_cents"`
}

// OrderRow is a row of the orders table. ItemCount is only filled by S6.
type OrderRow struct {
	ID         string
	Customer   string
	Status     string
	TotalCents int
	CreatedAt  time.Time
	ItemCount  int
}

// Store is the database side of the service.
type Store interface {
	CreateOrder(ctx context.Context, id, customer string, totalCents int, lines []Line) (time.Time, error)
	GetOrder(ctx context.Context, id string) (OrderRow, error)
	GetLines(ctx context.Context, id string) ([]Line, error)
	OrderStatus(ctx context.Context, id string) (string, error)
	ListRecent(ctx context.Context, cutoff time.Time) ([]OrderRow, error)           // S5
	ListRecentWithCounts(ctx context.Context, cutoff time.Time) ([]OrderRow, error) // S6
}

// PGStore is the pgx implementation of Store.
type PGStore struct {
	pool *pgxpool.Pool
}

// NewPGStore builds a pool of at most 5 connections. Connections are opened
// lazily, on first use. Statements go out unnamed (describe_exec), so every
// language puts the same thing on the wire.
func NewPGStore(ctx context.Context, url string) (*PGStore, error) {
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, err
	}
	cfg.MaxConns = 5
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeDescribeExec
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, err
	}
	return &PGStore{pool: pool}, nil
}

func (s *PGStore) Close() { s.pool.Close() }

func uuidString(u pgtype.UUID) string {
	b := u.Bytes
	const hex = "0123456789abcdef"
	out := make([]byte, 0, 36)
	for i, c := range b {
		if i == 4 || i == 6 || i == 8 || i == 10 {
			out = append(out, '-')
		}
		out = append(out, hex[c>>4], hex[c&0x0f])
	}
	return string(out)
}

func (s *PGStore) CreateOrder(ctx context.Context, id, customer string, totalCents int, lines []Line) (time.Time, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return time.Time{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var createdAt time.Time
	if err := tx.QueryRow(ctx, sqlCreateOrder, id, customer, int32(totalCents)).Scan(&createdAt); err != nil {
		return time.Time{}, err
	}
	for _, l := range lines {
		if _, err := tx.Exec(ctx, sqlCreateOrderLine, id, l.ProjectID, l.Name, int32(l.Quantity), int32(l.UnitPriceCents)); err != nil {
			return time.Time{}, err
		}
	}
	if err := tx.Commit(ctx); err != nil {
		return time.Time{}, err
	}
	return createdAt, nil
}

func (s *PGStore) GetOrder(ctx context.Context, id string) (OrderRow, error) {
	var (
		row OrderRow
		u   pgtype.UUID
		tc  int32
	)
	err := s.pool.QueryRow(ctx, sqlGetOrder, id).Scan(&u, &row.Customer, &row.Status, &tc, &row.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return OrderRow{}, errOrderNotFound
	}
	if err != nil {
		return OrderRow{}, err
	}
	row.ID = uuidString(u)
	row.TotalCents = int(tc)
	return row, nil
}

func (s *PGStore) GetLines(ctx context.Context, id string) ([]Line, error) {
	rows, err := s.pool.Query(ctx, sqlGetOrderLines, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	lines := []Line{}
	for rows.Next() {
		var (
			l      Line
			q, unt int32
		)
		if err := rows.Scan(&l.ProjectID, &l.Name, &q, &unt); err != nil {
			return nil, err
		}
		l.Quantity, l.UnitPriceCents = int(q), int(unt)
		lines = append(lines, l)
	}
	return lines, rows.Err()
}

func (s *PGStore) OrderStatus(ctx context.Context, id string) (string, error) {
	var status string
	err := s.pool.QueryRow(ctx, sqlOrderStatus, id).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", errOrderNotFound
	}
	return status, err
}

func (s *PGStore) list(ctx context.Context, query string, withCount bool, cutoff time.Time) ([]OrderRow, error) {
	rows, err := s.pool.Query(ctx, query, cutoff)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []OrderRow{}
	for rows.Next() {
		var (
			r     OrderRow
			u     pgtype.UUID
			tc    int32
			count int64
		)
		if withCount {
			err = rows.Scan(&u, &r.Customer, &r.Status, &tc, &r.CreatedAt, &count)
		} else {
			err = rows.Scan(&u, &r.Customer, &r.Status, &tc, &r.CreatedAt)
		}
		if err != nil {
			return nil, err
		}
		r.ID = uuidString(u)
		r.TotalCents = int(tc)
		r.ItemCount = int(count)
		out = append(out, r)
	}
	return out, rows.Err()
}

func (s *PGStore) ListRecent(ctx context.Context, cutoff time.Time) ([]OrderRow, error) {
	return s.list(ctx, sqlListRecent, false, cutoff)
}

func (s *PGStore) ListRecentWithCounts(ctx context.Context, cutoff time.Time) ([]OrderRow, error) {
	return s.list(ctx, sqlListRecentCount, true, cutoff)
}
