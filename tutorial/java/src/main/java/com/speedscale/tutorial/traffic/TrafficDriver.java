package com.speedscale.tutorial.traffic;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;

/**
 * Sends the contract's traffic sequence (contract/traffic.json) to a running service.
 * Usage: TrafficDriver [baseUrl]   (default http://localhost:8080; TRAFFIC_FILE overrides the file).
 */
public class TrafficDriver {

    private final ObjectMapper mapper = new ObjectMapper();
    private final HttpClient client = HttpClient.newBuilder()
            .proxy(HttpClient.Builder.NO_PROXY)
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(Duration.ofSeconds(10))
            .build();
    private final String baseUrl;
    private int sent;
    private int unexpected;

    TrafficDriver(String baseUrl) {
        this.baseUrl = baseUrl.endsWith("/") ? baseUrl.substring(0, baseUrl.length() - 1) : baseUrl;
    }

    public static void main(String[] args) throws IOException {
        String baseUrl = args.length > 0 ? args[0] : "http://localhost:8080";
        String file = System.getenv("TRAFFIC_FILE");
        Path path = Path.of(file == null || file.isEmpty() ? "../contract/traffic.json" : file);
        JsonNode plan = new ObjectMapper().readTree(Files.readAllBytes(path));

        TrafficDriver driver = new TrafficDriver(baseUrl);
        driver.run(plan);
        System.out.println("sent " + driver.sent + " requests, " + driver.unexpected + " unexpected");
        if (driver.unexpected > 0) {
            System.exit(1);
        }
    }

    void run(JsonNode plan) {
        call("GET", "/healthz", null, 200);
        for (int i = 0; i < plan.get("catalog_calls").asInt(); i++) {
            call("GET", "/catalog", null, 200);
        }
        JsonNode orders = plan.get("orders");
        for (int i = 0; i < plan.get("order_rounds").asInt(); i++) {
            String created = call("POST", "/orders", orders.get(i % orders.size()), 201);
            String id = null;
            if (created != null) {
                try {
                    id = mapper.readTree(created).path("id").asText(null);
                } catch (IOException e) {
                    id = null;
                }
            }
            if (created != null && (id == null || id.isEmpty())) {
                System.out.println("POST /orders: response has no id");
                unexpected++;
            }
            if (id == null || id.isEmpty()) {
                continue;
            }
            call("GET", "/orders/" + id, null, 200);
            call("GET", "/orders/" + id + "/status", null, 200);
        }
        for (int i = 0; i < plan.get("list_calls").asInt(); i++) {
            call("GET", "/orders", null, 200);
        }
        for (JsonNode bad : plan.get("bad_requests")) {
            call(bad.get("method").asText(), bad.get("path").asText(), bad.get("body"), bad.get("expect").asInt());
        }
    }

    /** Sends one request; returns the body, or null when it failed or had an unexpected status. */
    private String call(String method, String path, JsonNode body, int want) {
        sent++;
        HttpRequest.Builder request = HttpRequest.newBuilder(URI.create(baseUrl + path))
                .timeout(Duration.ofSeconds(10))
                .header("Accept", "application/json")
                .header("User-Agent", "tutorial-traffic/1");
        if (body == null) {
            request.method(method, HttpRequest.BodyPublishers.noBody());
        } else {
            request.header("Content-Type", "application/json");
            request.method(method, HttpRequest.BodyPublishers.ofString(body.toString()));
        }
        try {
            HttpResponse<String> response = client.send(request.build(), HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != want) {
                System.out.println(method + " " + path + ": got " + response.statusCode() + ", want " + want);
                unexpected++;
                return null;
            }
            return response.body();
        } catch (IOException e) {
            System.out.println(method + " " + path + ": request failed: " + e);
            unexpected++;
            return null;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            System.out.println(method + " " + path + ": interrupted");
            unexpected++;
            return null;
        }
    }
}
