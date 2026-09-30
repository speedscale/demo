package com.speedscale.tutorial;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;

/** Postgres access. The SQL text lives in the implementation and matches contract/SPEC.md. */
public interface OrderStore {

    record Row(String id, String customer, String status, int totalCents, Instant createdAt) {
    }

    record Line(String projectId, String name, int quantity, int unitPriceCents) {
    }

    record SummaryRow(Row order, long itemCount) {
    }

    /** S1 plus S2 per line, in one transaction. Returns created_at. */
    Instant createOrder(String id, String customer, int totalCents, List<Line> lines);

    /** S3 */
    Optional<Row> findOrder(String id);

    /** S4 */
    List<Line> findLines(String id);

    /** S7 */
    Optional<String> findStatus(String id);

    /** S5 */
    List<Row> listRecent(OffsetDateTime cutoff);

    /** S6 */
    List<SummaryRow> listRecentWithCounts(OffsetDateTime cutoff);
}
