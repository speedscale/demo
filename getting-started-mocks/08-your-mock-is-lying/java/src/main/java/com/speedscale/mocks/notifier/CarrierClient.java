package com.speedscale.mocks.notifier;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/** The real carrier client, pointed at a test-controlled server by wire tests. */
public final class CarrierClient implements ShipmentStatus {
    private static final ObjectMapper JSON = new ObjectMapper();

    private final String baseUrl;
    private final String apiKey;
    private final HttpClient http = HttpClient.newHttpClient();

    public CarrierClient(String baseUrl, String apiKey) {
        this.baseUrl = baseUrl.replaceAll("/+$", "");
        this.apiKey = apiKey;
    }

    @Override
    public String lookup(String trackingNumber) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/shipments/" + trackingNumber))
                .timeout(Duration.ofSeconds(2))
                .header("X-API-Key", apiKey)
                .header("Accept", "application/json")
                .GET()
                .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new CarrierUnavailableException("carrier returned " + response.statusCode());
        }
        JsonNode shipment = JSON.readTree(response.body());
        if (!shipment.has("status")) {
            throw new CarrierContractException("no status field");
        }
        return shipment.get("status").asText();
    }
}
