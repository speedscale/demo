package com.speedscale.tutorial;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.ObjectReader;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

/** A validated POST /orders body. */
public record OrderRequest(String customer, List<Line> items) {

    public record Line(String projectId, int quantity) {
    }

    private static final ObjectReader READER = new ObjectMapper()
            .readerFor(JsonNode.class)
            .with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);

    /** Validates in the contract's order; the first problem is a 400 ApiException. */
    public static OrderRequest parse(byte[] body) {
        JsonNode root;
        try {
            root = body == null || body.length == 0 ? null : READER.readTree(body);
        } catch (IOException e) {
            root = null;
        }
        if (root == null || !root.isObject()) {
            throw bad("invalid JSON body");
        }

        JsonNode customer = root.get("customer");
        if (customer == null || !customer.isTextual() || customer.textValue().isEmpty()) {
            throw bad("customer is required");
        }

        JsonNode items = root.get("items");
        if (items == null || !items.isArray() || items.isEmpty() || items.size() > 10) {
            throw bad("items must have 1 to 10 entries");
        }

        List<Line> lines = new ArrayList<>();
        for (JsonNode item : items) {
            JsonNode projectId = item.get("project_id");
            if (projectId == null || !projectId.isTextual() || projectId.textValue().isEmpty()) {
                throw bad("project_id is required");
            }
            JsonNode quantity = item.get("quantity");
            if (!validQuantity(quantity)) {
                throw bad("quantity must be between 1 and 99");
            }
            lines.add(new Line(projectId.textValue(), (int) quantity.doubleValue()));
        }
        return new OrderRequest(customer.textValue(), lines);
    }

    /** A JSON number with no fractional part (2.0 counts as 2) in 1..99. */
    private static boolean validQuantity(JsonNode quantity) {
        if (quantity == null || !quantity.isNumber()) {
            return false;
        }
        double value = quantity.doubleValue();
        return value >= 1 && value <= 99 && value == Math.floor(value);
    }

    private static ApiException bad(String message) {
        return new ApiException(400, message);
    }
}
