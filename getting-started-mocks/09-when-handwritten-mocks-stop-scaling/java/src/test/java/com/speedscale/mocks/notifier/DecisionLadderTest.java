package com.speedscale.mocks.notifier;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import org.junit.jupiter.api.Test;

class DecisionLadderTest {
    @Test
    void sameBehaviorWithFunctionStub() throws Exception {
        List<String> messages = new ArrayList<>();
        MemoryRecorder recorder = new MemoryRecorder();
        PackageNotifier notifier = new PackageNotifier(
                trackingNumber -> "delayed",
                (trackingNumber, message) -> messages.add(message),
                recorder,
                duration -> {});

        notifier.notify("TRACK-123");

        assertNotifiedOnce(messages, recorder);
    }

    @Test
    void sameBehaviorWithFakeServer() throws Exception {
        try (MockWebServer carrier = new MockWebServer()) {
            carrier.enqueue(new MockResponse().setBody(Files.readString(
                    Path.of("..", "fixtures", "carrier-shipment-delayed.json"))));
            carrier.start();

            List<String> messages = new ArrayList<>();
            MemoryRecorder recorder = new MemoryRecorder();
            PackageNotifier notifier = new PackageNotifier(
                    new CarrierClient(carrier.url("/").toString(), "secret-key"),
                    (trackingNumber, message) -> messages.add(message),
                    recorder,
                    duration -> {});

            notifier.notify("TRACK-123");

            assertNotifiedOnce(messages, recorder);
        }
    }

    private static void assertNotifiedOnce(List<String> messages, MemoryRecorder recorder) {
        assertEquals(List.of("Package TRACK-123 is delayed"), messages);
        assertEquals(1, recorder.count());
    }
}
