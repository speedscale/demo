package com.speedscale.mocks.notifier;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;

/**
 * The production ShipmentStatus: it asks the carrier's HTTP API. This is the
 * same code that used to live inside notify(), moved behind the seam. Nothing
 * in this post's tests runs it; that is deliberate and the post says why.
 */
public final class HttpShipmentStatus implements ShipmentStatus {
    private static final ObjectMapper JSON = new ObjectMapper();

    private final String baseUrl;
    private final HttpClient http = HttpClient.newHttpClient();

    public HttpShipmentStatus(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    @Override
    public String lookup(String trackingNumber) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(baseUrl + "/shipments/" + trackingNumber))
                .GET()
                .build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() != 200) {
            throw new IOException("carrier returned " + response.statusCode());
        }
        JsonNode shipment = JSON.readTree(response.body());
        return shipment.path("status").asText();
    }
}
