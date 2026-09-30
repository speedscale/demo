package com.speedscale.tutorial;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class OrderRequestTest {

    private static OrderRequest parse(String json) {
        return OrderRequest.parse(json == null ? null : json.getBytes(StandardCharsets.UTF_8));
    }

    private static void rejects(String json, String message) {
        assertThatThrownBy(() -> parse(json))
                .isInstanceOfSatisfying(ApiException.class, e -> {
                    assertThat(e.status()).isEqualTo(400);
                    assertThat(e.getMessage()).isEqualTo(message);
                });
    }

    @Test
    void acceptsAValidOrder() {
        OrderRequest r = parse("{\"customer\":\"ada@example.com\",\"items\":[{\"project_id\":\"kubernetes\",\"quantity\":2}]}");
        assertThat(r.customer()).isEqualTo("ada@example.com");
        assertThat(r.items()).containsExactly(new OrderRequest.Line("kubernetes", 2));
    }

    @Test
    void bodyMustBeAJsonObject() {
        rejects(null, "invalid JSON body");
        rejects("", "invalid JSON body");
        rejects("{bad", "invalid JSON body");
        rejects("[1]", "invalid JSON body");
        rejects("\"x\"", "invalid JSON body");
        rejects("{} trailing", "invalid JSON body");
    }

    @Test
    void customerIsRequired() {
        rejects("{\"items\":[{\"project_id\":\"a\",\"quantity\":1}]}", "customer is required");
        rejects("{\"customer\":\"\",\"items\":[]}", "customer is required");
        rejects("{\"customer\":5,\"items\":[]}", "customer is required");
    }

    @Test
    void itemsMustHaveOneToTenEntries() {
        rejects("{\"customer\":\"a\"}", "items must have 1 to 10 entries");
        rejects("{\"customer\":\"a\",\"items\":{}}", "items must have 1 to 10 entries");
        rejects("{\"customer\":\"a\",\"items\":[]}", "items must have 1 to 10 entries");
        String eleven = "{\"project_id\":\"a\",\"quantity\":1},".repeat(10) + "{\"project_id\":\"a\",\"quantity\":1}";
        rejects("{\"customer\":\"a\",\"items\":[" + eleven + "]}", "items must have 1 to 10 entries");
    }

    @Test
    void projectIdIsRequired() {
        rejects("{\"customer\":\"a\",\"items\":[{\"quantity\":1}]}", "project_id is required");
        rejects("{\"customer\":\"a\",\"items\":[{\"project_id\":\"\",\"quantity\":1}]}", "project_id is required");
        rejects("{\"customer\":\"a\",\"items\":[{\"project_id\":7,\"quantity\":1}]}", "project_id is required");
        rejects("{\"customer\":\"a\",\"items\":[1]}", "project_id is required");
    }

    @Test
    void quantityMustBeAnIntegerFromOneTo99() {
        for (String q : new String[]{"0", "100", "-1", "1.5", "0.5", "98.5", "\"2\"", "null", "true", "99999999999999999999"}) {
            rejects("{\"customer\":\"a\",\"items\":[{\"project_id\":\"k\",\"quantity\":" + q + "}]}",
                    "quantity must be between 1 and 99");
        }
        rejects("{\"customer\":\"a\",\"items\":[{\"project_id\":\"k\"}]}", "quantity must be between 1 and 99");
        assertThat(parse("{\"customer\":\"a\",\"items\":[{\"project_id\":\"k\",\"quantity\":99}]}").items().get(0).quantity())
                .isEqualTo(99);
        assertThat(parse("{\"customer\":\"a\",\"items\":[{\"project_id\":\"k\",\"quantity\":2.0}]}").items().get(0).quantity())
                .isEqualTo(2);
    }

    @Test
    void checksProjectIdBeforeQuantityAndItemsInOrder() {
        rejects("{\"customer\":\"a\",\"items\":[{\"quantity\":0}]}", "project_id is required");
        rejects("{\"customer\":\"a\",\"items\":[{\"project_id\":\"k\",\"quantity\":0},{\"quantity\":1}]}",
                "quantity must be between 1 and 99");
    }
}
