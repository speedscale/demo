package com.speedscale.tutorial;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.annotation.JsonPropertyOrder;

import java.util.List;

/** Response shapes. Record order is the JSON key order; @JsonPropertyOrder makes that explicit. */
public final class Views {

    private Views() {
    }

    /** total_cents is a number, except under APP_VERSION=v2 where the planted regression renders a string. */
    public static Object totalCents(long cents, boolean v2) {
        return v2 ? Long.toString(cents) : (Object) cents;
    }

    @JsonPropertyOrder({"status"})
    public record Health(String status) {
    }

    @JsonPropertyOrder({"project_id", "name", "maturity", "unit_price_cents"})
    public record Product(@JsonProperty("project_id") String projectId, String name, String maturity,
                          @JsonProperty("unit_price_cents") int unitPriceCents) {
    }

    @JsonPropertyOrder({"products", "generated_at"})
    public record Catalog(List<Product> products, @JsonProperty("generated_at") String generatedAt) {
    }

    @JsonPropertyOrder({"project_id", "name", "quantity", "unit_price_cents"})
    public record Item(@JsonProperty("project_id") String projectId, String name, int quantity,
                       @JsonProperty("unit_price_cents") int unitPriceCents) {
    }

    @JsonPropertyOrder({"id", "customer", "status", "items", "total_cents", "created_at", "generated_at"})
    public record Order(String id, String customer, String status, List<Item> items,
                        @JsonProperty("total_cents") Object totalCents,
                        @JsonProperty("created_at") String createdAt,
                        @JsonProperty("generated_at") String generatedAt) {
    }

    @JsonPropertyOrder({"id", "status", "generated_at"})
    public record Status(String id, String status, @JsonProperty("generated_at") String generatedAt) {
    }

    @JsonPropertyOrder({"id", "customer", "status", "item_count", "total_cents", "created_at"})
    public record OrderSummary(String id, String customer, String status,
                               @JsonProperty("item_count") long itemCount,
                               @JsonProperty("total_cents") Object totalCents,
                               @JsonProperty("created_at") String createdAt) {
    }

    @JsonPropertyOrder({"orders", "generated_at"})
    public record OrderList(List<OrderSummary> orders, @JsonProperty("generated_at") String generatedAt) {
    }

    public record Error(String error) {
    }
}
