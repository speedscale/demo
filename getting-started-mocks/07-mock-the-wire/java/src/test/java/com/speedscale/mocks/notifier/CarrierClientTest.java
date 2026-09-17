package com.speedscale.mocks.notifier;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.core.JsonProcessingException;
import java.io.IOException;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class CarrierClientTest {
    private MockWebServer carrier;

    @BeforeEach
    void startCarrier() throws IOException {
        carrier = new MockWebServer();
        carrier.start();
    }

    @AfterEach
    void stopCarrier() throws IOException {
        carrier.shutdown();
    }

    private String carrierUrl() {
        return carrier.url("/").toString();
    }

    @Test
    void sendsTrackingNumberAndApiKey() throws Exception {
        carrier.enqueue(new MockResponse().setBody("{\"status\":\"delayed\"}"));

        new CarrierClient(carrierUrl(), "secret-key").lookup("TRACK-123");

        RecordedRequest request = carrier.takeRequest();
        assertTrue(request.getPath().contains("TRACK-123"), "path was " + request.getPath());
        assertEquals("secret-key", request.getHeader("X-API-Key"));
        assertEquals("application/json", request.getHeader("Accept"));
    }

    @Test
    void parsesKnownShipmentStates() throws Exception {
        for (String status : new String[] {"delayed", "delivered", "in_transit", "lost"}) {
            carrier.enqueue(new MockResponse().setBody("{\"status\":\"" + status + "\"}"));
            assertEquals(status, new CarrierClient(carrierUrl(), "secret-key").lookup("TRACK-123"));
        }
    }

    @Test
    void treatsNon200AsCarrierUnavailable() {
        carrier.enqueue(new MockResponse().setResponseCode(503).setBody("upstream is down"));
        assertThrows(
                CarrierUnavailableException.class,
                () -> new CarrierClient(carrierUrl(), "secret-key").lookup("TRACK-123"));
    }

    @Test
    void failsCleanlyOnMalformedJson() {
        carrier.enqueue(new MockResponse().setBody("{\"status\": "));
        assertThrows(
                JsonProcessingException.class,
                () -> new CarrierClient(carrierUrl(), "secret-key").lookup("TRACK-123"));
    }
}
