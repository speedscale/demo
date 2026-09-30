package com.speedscale.tutorial;

import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
public class OrderService {

    private static final Pattern UUID_PATTERN =
            Pattern.compile("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$");

    private final ProjectsClient projects;
    private final OrderStore store;
    private final AppSettings settings;
    private final Clock clock;

    public OrderService(ProjectsClient projects, OrderStore store, AppSettings settings, Clock clock) {
        this.projects = projects;
        this.store = store;
        this.settings = settings;
        this.clock = clock;
    }

    public Views.Health health() {
        return new Views.Health("ok");
    }

    public Views.Catalog catalog() {
        List<Views.Product> products = new ArrayList<>();
        for (Project p : projects.listProjects()) {
            products.add(new Views.Product(p.id(), p.name(), p.maturity(), Pricing.unitPriceCents(p.maturity())));
        }
        return new Views.Catalog(products, now());
    }

    public Views.Order create(OrderRequest request) {
        // One sequential upstream lookup per item, even when a project repeats.
        List<OrderStore.Line> lines = new ArrayList<>();
        long total = 0;
        for (OrderRequest.Line item : request.items()) {
            Project project = projects.getProject(item.projectId())
                    .orElseThrow(() -> new ApiException(422, "unknown project: " + item.projectId()));
            int unitPrice = Pricing.unitPriceCents(project.maturity());
            lines.add(new OrderStore.Line(item.projectId(), project.name(), item.quantity(), unitPrice));
            total += (long) item.quantity() * unitPrice;
        }
        String id = UUID.randomUUID().toString().toLowerCase(Locale.ROOT);
        Instant createdAt = store.createOrder(id, request.customer(), (int) total, lines);
        return order(id, request.customer(), "placed", lines, total, createdAt);
    }

    public Views.Order getOrder(String id) {
        requireUuid(id);
        OrderStore.Row row = store.findOrder(id).orElseThrow(OrderService::notFound);
        return order(row.id(), row.customer(), row.status(), store.findLines(id), row.totalCents(), row.createdAt());
    }

    public Views.Status getStatus(String id) {
        requireUuid(id);
        String status = store.findStatus(id).orElseThrow(OrderService::notFound);
        return new Views.Status(id, status, now());
    }

    public Views.OrderList listRecent() {
        OffsetDateTime cutoff = OffsetDateTime.ofInstant(clock.instant().minus(Duration.ofHours(1)), ZoneOffset.UTC);
        List<Views.OrderSummary> orders = new ArrayList<>();
        if (settings.slow()) {
            // Planted N+1: S5, then S4 once per order just to count its lines.
            for (OrderStore.Row row : store.listRecent(cutoff)) {
                orders.add(summary(row, store.findLines(row.id()).size()));
            }
        } else {
            for (OrderStore.SummaryRow row : store.listRecentWithCounts(cutoff)) {
                orders.add(summary(row.order(), row.itemCount()));
            }
        }
        return new Views.OrderList(orders, now());
    }

    private Views.OrderSummary summary(OrderStore.Row row, long itemCount) {
        return new Views.OrderSummary(row.id(), row.customer(), row.status(), itemCount,
                Views.totalCents(row.totalCents(), settings.isV2()), Timestamps.format(row.createdAt()));
    }

    private Views.Order order(String id, String customer, String status, List<OrderStore.Line> lines,
                              long total, Instant createdAt) {
        List<Views.Item> items = new ArrayList<>();
        for (OrderStore.Line l : lines) {
            items.add(new Views.Item(l.projectId(), l.name(), l.quantity(), l.unitPriceCents()));
        }
        return new Views.Order(id, customer, status, items, Views.totalCents(total, settings.isV2()),
                Timestamps.format(createdAt), now());
    }

    private String now() {
        return Timestamps.format(clock.instant());
    }

    private static void requireUuid(String id) {
        if (!UUID_PATTERN.matcher(id).matches()) {
            throw notFound();
        }
    }

    private static ApiException notFound() {
        return new ApiException(404, "order not found");
    }
}
