package com.speedscale.mocks.before;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.Optional;

/**
 * The package notifier before it had a seam. It talks to the carrier directly,
 * which is exactly why it cannot be tested: nothing in a test can make the
 * carrier say a package is delayed.
 */
public final class PackageNotifier {
    private static final String CARRIER_URL = "https://api.example-carrier.test";
    private static final HttpClient HTTP = HttpClient.newHttpClient();
    private static final ObjectMapper JSON = new ObjectMapper();

    private PackageNotifier() {}

    /** Returns the message to send to the customer, or empty when there is nothing to say. */
    public static Optional<String> notify(String trackingNumber) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(CARRIER_URL + "/shipments/" + trackingNumber))
                .GET()
                .build();
        HttpResponse<String> response = HTTP.send(request, HttpResponse.BodyHandlers.ofString());
        JsonNode shipment = JSON.readTree(response.body());

        if ("delayed".equals(shipment.path("status").asText())) {
            return Optional.of("Package " + trackingNumber + " is delayed");
        }
        return Optional.empty();
    }
}
