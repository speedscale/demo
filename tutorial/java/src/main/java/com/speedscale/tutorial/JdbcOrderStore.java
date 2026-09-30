package com.speedscale.tutorial;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

@Repository
public class JdbcOrderStore implements OrderStore {

    // S1 create order (inside a transaction, returns created_at)
    static final String S1 = "INSERT INTO orders (id, customer, status, total_cents) VALUES (?::uuid, ?, 'placed', ?) RETURNING created_at";
    // S2 create order line (inside the same transaction, once per item, in request order)
    static final String S2 = "INSERT INTO order_items (order_id, project_id, name, quantity, unit_price_cents) VALUES (?::uuid, ?, ?, ?, ?)";
    // S3 get order
    static final String S3 = "SELECT id, customer, status, total_cents, created_at FROM orders WHERE id = ?::uuid";
    // S4 get order lines
    static final String S4 = "SELECT project_id, name, quantity, unit_price_cents FROM order_items WHERE order_id = ?::uuid ORDER BY id";
    // S5 list recent orders (APP_SLOW=1 only)
    static final String S5 = "SELECT id, customer, status, total_cents, created_at FROM orders WHERE created_at > ?::timestamptz ORDER BY created_at DESC LIMIT 50";
    // S6 list recent orders with item counts (default)
    static final String S6 = "SELECT o.id, o.customer, o.status, o.total_cents, o.created_at, COUNT(i.id) AS item_count FROM orders o LEFT JOIN order_items i ON i.order_id = o.id WHERE o.created_at > ?::timestamptz GROUP BY o.id ORDER BY o.created_at DESC LIMIT 50";
    // S7 order status
    static final String S7 = "SELECT status FROM orders WHERE id = ?::uuid";

    private static final RowMapper<Row> ROW = (rs, n) -> new Row(
            rs.getString("id"),
            rs.getString("customer"),
            rs.getString("status"),
            rs.getInt("total_cents"),
            rs.getObject("created_at", OffsetDateTime.class).toInstant());

    private static final RowMapper<Line> LINE = (rs, n) -> new Line(
            rs.getString("project_id"),
            rs.getString("name"),
            rs.getInt("quantity"),
            rs.getInt("unit_price_cents"));

    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;

    public JdbcOrderStore(JdbcTemplate jdbc, PlatformTransactionManager transactionManager) {
        this.jdbc = jdbc;
        this.tx = new TransactionTemplate(transactionManager);
    }

    @Override
    public Instant createOrder(String id, String customer, int totalCents, List<Line> lines) {
        return tx.execute(status -> {
            Instant createdAt = jdbc.queryForObject(S1,
                    (rs, n) -> rs.getObject("created_at", OffsetDateTime.class).toInstant(),
                    id, customer, totalCents);
            for (Line line : lines) {
                jdbc.update(S2, id, line.projectId(), line.name(), line.quantity(), line.unitPriceCents());
            }
            return createdAt;
        });
    }

    @Override
    public Optional<Row> findOrder(String id) {
        return jdbc.query(S3, ROW, id).stream().findFirst();
    }

    @Override
    public List<Line> findLines(String id) {
        return jdbc.query(S4, LINE, id);
    }

    @Override
    public Optional<String> findStatus(String id) {
        return jdbc.query(S7, (rs, n) -> rs.getString("status"), id).stream().findFirst();
    }

    @Override
    public List<Row> listRecent(OffsetDateTime cutoff) {
        return jdbc.query(S5, ROW, cutoff);
    }

    @Override
    public List<SummaryRow> listRecentWithCounts(OffsetDateTime cutoff) {
        return jdbc.query(S6, (rs, n) -> new SummaryRow(ROW.mapRow(rs, n), rs.getLong("item_count")), cutoff);
    }
}
