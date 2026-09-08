package com.speedscale.mocks.notifier;

import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Iterator;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

@EnabledIfEnvironmentVariable(named = "CARRIER_CONTRACT_TEST", matches = "1")
class LiveCarrierContractTest {
    private static final ObjectMapper JSON = new ObjectMapper();

    @Test
    void liveResponseStillMatchesTheCapturedShape() throws Exception {
        String baseUrl = required("CARRIER_URL").replaceAll("/+$", "");
        String apiKey = required("CARRIER_API_KEY");
        String trackingNumber = required("CARRIER_TRACKING_NUMBER");

        new CarrierClient(baseUrl, apiKey).lookup(trackingNumber);

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/shipments/" + trackingNumber))
                .header("X-API-Key", apiKey)
                .header("Accept", "application/json")
                .GET()
                .build();
        String body = HttpClient.newHttpClient()
                .send(request, HttpResponse.BodyHandlers.ofString())
                .body();
        JsonNode live = JSON.readTree(body);
        JsonNode captured = JSON.readTree(
                Files.readString(Path.of("..", "fixtures", "carrier-shipment-delayed.json")));
        Iterator<String> fields = captured.fieldNames();
        while (fields.hasNext()) {
            String field = fields.next();
            assertTrue(live.has(field), "live response is missing captured field " + field);
        }
    }

    private static String required(String name) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(name + " is required");
        }
        return value;
    }
}
