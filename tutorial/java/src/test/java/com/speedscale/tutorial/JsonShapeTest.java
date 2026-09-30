package com.speedscale.tutorial;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class JsonShapeTest {

    private final ObjectMapper mapper = new ObjectMapper();

    private Views.Order order(boolean v2) {
        return new Views.Order("11111111-2222-4333-8444-555555555555", "ada@example.com", "placed",
                List.of(new Views.Item("kubernetes", "Kubernetes", 2, 1200)),
                Views.totalCents(2400, v2), "2026-09-30T10:44:50.123Z", "2026-09-30T10:44:51.456Z");
    }

    @Test
    void orderObjectKeyOrderAndCompactness() throws Exception {
        assertThat(mapper.writeValueAsString(order(false))).isEqualTo(
                "{\"id\":\"11111111-2222-4333-8444-555555555555\",\"customer\":\"ada@example.com\",\"status\":\"placed\","
                        + "\"items\":[{\"project_id\":\"kubernetes\",\"name\":\"Kubernetes\",\"quantity\":2,\"unit_price_cents\":1200}],"
                        + "\"total_cents\":2400,\"created_at\":\"2026-09-30T10:44:50.123Z\",\"generated_at\":\"2026-09-30T10:44:51.456Z\"}");
    }

    @Test
    void v2RendersTotalCentsAsAString() throws Exception {
        assertThat(mapper.writeValueAsString(order(true))).contains("\"total_cents\":\"2400\"");
        Views.OrderSummary summary = new Views.OrderSummary("id", "ada@example.com", "placed", 1,
                Views.totalCents(2400, true), "2026-09-30T10:44:50.123Z");
        assertThat(mapper.writeValueAsString(summary)).isEqualTo(
                "{\"id\":\"id\",\"customer\":\"ada@example.com\",\"status\":\"placed\",\"item_count\":1,"
                        + "\"total_cents\":\"2400\",\"created_at\":\"2026-09-30T10:44:50.123Z\"}");
    }

    @Test
    void otherShapes() throws Exception {
        assertThat(mapper.writeValueAsString(new Views.Health("ok"))).isEqualTo("{\"status\":\"ok\"}");
        assertThat(mapper.writeValueAsString(new Views.Status("id", "placed", "t"))).isEqualTo("{\"id\":\"id\",\"status\":\"placed\",\"generated_at\":\"t\"}");
        assertThat(mapper.writeValueAsString(new Views.Catalog(List.of(new Views.Product("k", "K", "Graduated", 1200)), "t")))
                .isEqualTo("{\"products\":[{\"project_id\":\"k\",\"name\":\"K\",\"maturity\":\"Graduated\",\"unit_price_cents\":1200}],\"generated_at\":\"t\"}");
        assertThat(mapper.writeValueAsString(new Views.Error("not found"))).isEqualTo("{\"error\":\"not found\"}");
        assertThat(Timestamps.format(Instant.EPOCH)).endsWith("Z");
    }
}
