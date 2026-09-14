package com.speedscale.mocks.notifier;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class CarrierFixtureTest {
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

    private String fixture(String name) throws IOException {
        return Files.readString(Path.of("..", "fixtures", name));
    }

    @Test
    void parsesTheCapturedFixture() throws Exception {
        carrier.enqueue(new MockResponse().setBody(fixture("carrier-shipment-delayed.json")));
        assertEquals(
                "delayed",
                new CarrierClient(carrier.url("/").toString(), "secret-key").lookup("TRACK-123"));
    }

    @Test
    void rejectsTheRenamedField() throws Exception {
        carrier.enqueue(new MockResponse().setBody(fixture("carrier-shipment-delayed-v2.json")));
        IOException error = assertThrows(
                CarrierContractException.class,
                () -> new CarrierClient(carrier.url("/").toString(), "secret-key")
                        .lookup("TRACK-123"));
        assertFalse(error instanceof CarrierUnavailableException);
    }
}
