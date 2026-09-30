package com.speedscale.tutorial;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Service logic against a stubbed upstream and an in-memory store: no Postgres, no network. */
class OrderServiceTest {

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-09-30T10:44:50.123456Z"), ZoneOffset.UTC);

    static class StubProjects implements ProjectsClient {
        final Map<String, Project> known = Map.of(
                "kubernetes", new Project("kubernetes", "Kubernetes", "Graduated"),
                "helm", new Project("helm", "Helm", "Incubating"),
                "k3s", new Project("k3s", "K3s", "Sandbox"),
                "odd", new Project("odd", "Odd", "Mystery"));
        final List<String> lookups = new ArrayList<>();

        @Override
        public List<Project> listProjects() {
            return List.copyOf(known.values());
        }

        @Override
        public Optional<Project> getProject(String id) {
            lookups.add(id);
            return Optional.ofNullable(known.get(id));
        }
    }

    static class MemoryStore implements OrderStore {
        final List<Row> rows = new ArrayList<>();
        final List<Line> lines = new ArrayList<>();
        int findLinesCalls;
        OffsetDateTime lastCutoff;

        @Override
        public Instant createOrder(String id, String customer, int totalCents, List<Line> newLines) {
            Instant createdAt = Instant.parse("2026-09-30T10:44:49.987654Z");
            rows.add(new Row(id, customer, "placed", totalCents, createdAt));
            lines.addAll(newLines);
            return createdAt;
        }

        @Override
        public Optional<Row> findOrder(String id) {
            return rows.stream().filter(r -> r.id().equals(id)).findFirst();
        }

        @Override
        public List<Line> findLines(String id) {
            findLinesCalls++;
            return lines;
        }

        @Override
        public Optional<String> findStatus(String id) {
            return findOrder(id).map(Row::status);
        }

        @Override
        public List<Row> listRecent(OffsetDateTime cutoff) {
            lastCutoff = cutoff;
            return rows;
        }

        @Override
        public List<SummaryRow> listRecentWithCounts(OffsetDateTime cutoff) {
            lastCutoff = cutoff;
            return rows.stream().map(r -> new SummaryRow(r, lines.size())).toList();
        }
    }

    private final StubProjects projects = new StubProjects();
    private final MemoryStore store = new MemoryStore();

    private OrderService service(String version, boolean slow) {
        return new OrderService(projects, store, new AppSettings(version, slow), CLOCK);
    }

    private static OrderRequest request(String projectId, int quantity) {
        return new OrderRequest("ada@example.com", List.of(new OrderRequest.Line(projectId, quantity)));
    }

    @Test
    void createPricesByMaturityAndSumsTotals() {
        OrderRequest req = new OrderRequest("ada@example.com", List.of(
                new OrderRequest.Line("kubernetes", 2),
                new OrderRequest.Line("helm", 1),
                new OrderRequest.Line("k3s", 4),
                new OrderRequest.Line("odd", 1)));
        Views.Order order = service("v1", false).create(req);
        assertThat(order.totalCents()).isEqualTo(2400L + 800 + 2000 + 1000);
        assertThat(order.items()).extracting(Views.Item::unitPriceCents).containsExactly(1200, 800, 500, 1000);
        assertThat(order.createdAt()).isEqualTo("2026-09-30T10:44:49.987Z");
        assertThat(order.generatedAt()).isEqualTo("2026-09-30T10:44:50.123Z");
        assertThat(order.id()).matches("[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}");
    }

    @Test
    void unknownProjectIs422AndWritesNothing() {
        OrderRequest req = new OrderRequest("ada@example.com", List.of(
                new OrderRequest.Line("kubernetes", 1), new OrderRequest.Line("nope", 1), new OrderRequest.Line("helm", 1)));
        assertThatThrownBy(() -> service("v1", false).create(req))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.status()).isEqualTo(422);
                    assertThat(e.getMessage()).isEqualTo("unknown project: nope");
                });
        assertThat(store.rows).isEmpty();
        assertThat(projects.lookups).containsExactly("kubernetes", "nope");
    }

    @Test
    void repeatedProjectsAreLookedUpOncePerItem() {
        OrderRequest req = new OrderRequest("a", List.of(
                new OrderRequest.Line("helm", 1), new OrderRequest.Line("helm", 2)));
        service("v1", false).create(req);
        assertThat(projects.lookups).containsExactly("helm", "helm");
    }

    @Test
    void v2RendersTotalsAsStrings() {
        OrderService v2 = service("v2", false);
        assertThat(v2.create(request("kubernetes", 2)).totalCents()).isEqualTo("2400");
        String id = store.rows.get(0).id();
        assertThat(v2.getOrder(id).totalCents()).isEqualTo("2400");
        assertThat(v2.listRecent().orders().get(0).totalCents()).isEqualTo("2400");
        assertThat(service("v1", false).listRecent().orders().get(0).totalCents()).isEqualTo(2400L);
    }

    @Test
    void invalidUuidIsNotFoundWithoutTouchingTheStore() {
        OrderService svc = service("v1", false);
        for (String id : new String[]{"abc", "", "00000000-0000-4000-8000-00000000000", "zzzzzzzz-0000-4000-8000-000000000000"}) {
            assertThatThrownBy(() -> svc.getOrder(id)).isInstanceOfSatisfying(ApiException.class,
                    e -> assertThat(e.status()).isEqualTo(404));
            assertThatThrownBy(() -> svc.getStatus(id)).isInstanceOf(ApiException.class);
        }
        assertThat(store.findLinesCalls).isZero();
    }

    @Test
    void missingOrderIsNotFound() {
        assertThatThrownBy(() -> service("v1", false).getOrder("00000000-0000-4000-8000-000000000000"))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.status()).isEqualTo(404);
                    assertThat(e.getMessage()).isEqualTo("order not found");
                });
    }

    @Test
    void listCutoffIsOneHourAgo() {
        service("v1", false).listRecent();
        assertThat(store.lastCutoff.toInstant()).isEqualTo(Instant.parse("2026-09-30T09:44:50.123456Z"));
    }

    @Test
    void slowModeCountsLinesWithOneQueryPerOrder() {
        OrderService svc = service("v1", true);
        svc.create(request("kubernetes", 1));
        svc.create(request("helm", 1));
        store.findLinesCalls = 0;
        Views.OrderList list = svc.listRecent();
        assertThat(list.orders()).hasSize(2);
        assertThat(store.findLinesCalls).isEqualTo(2);
        assertThat(list.orders().get(0).itemCount()).isEqualTo(2);
    }
}
