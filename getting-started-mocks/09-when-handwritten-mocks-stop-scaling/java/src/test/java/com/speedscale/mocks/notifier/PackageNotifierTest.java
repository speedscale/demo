package com.speedscale.mocks.notifier;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.fail;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;

class PackageNotifierTest {
    private static final Sleep DUMMY_SLEEPER = duration -> {};

    private static ShipmentStatus stubStatus(String status) {
        return trackingNumber -> status;
    }

    private static final class SpySender implements Sender {
        private final List<String> messages = new ArrayList<>();

        @Override
        public void send(String trackingNumber, String message) {
            messages.add(message);
        }
    }

    @Test
    void notifiesTheCustomerOnlyOnce() throws Exception {
        SpySender sender = new SpySender();
        MemoryRecorder recorder = new MemoryRecorder();
        PackageNotifier notifier =
                new PackageNotifier(stubStatus("delayed"), sender, recorder, DUMMY_SLEEPER);

        for (int i = 0; i < 3; i++) {
            notifier.notify("TRACK-123");
        }

        assertEquals(1, sender.messages.size());
        assertEquals(1, recorder.count());
    }

    @Test
    void deliveredPackageIsNotRecorded() throws Exception {
        SpySender sender = new SpySender();
        MemoryRecorder recorder = new MemoryRecorder();
        new PackageNotifier(stubStatus("delivered"), sender, recorder, DUMMY_SLEEPER)
                .notify("TRACK-123");

        assertEquals(List.of(), sender.messages);
        assertEquals(0, recorder.count());
    }

    private static final class MockSender implements Sender {
        private final String expectedMessage;
        private int calls;

        MockSender(String expectedMessage) {
            this.expectedMessage = expectedMessage;
        }

        @Override
        public void send(String trackingNumber, String message) {
            calls++;
            if (calls > 1) {
                fail("sender called " + calls + " times, expected exactly 1");
            }
            assertEquals(expectedMessage, message);
        }

        void verify() {
            assertEquals(1, calls, "expected exactly one send");
        }
    }

    @Test
    void strictMockOwnsItsExpectation() throws Exception {
        MockSender sender = new MockSender("Package TRACK-123 is delayed");
        new PackageNotifier(stubStatus("delayed"), sender, new MemoryRecorder(), DUMMY_SLEEPER)
                .notify("TRACK-123");
        sender.verify();
    }

    @Test
    void carrierFailureSurfacesWithoutSending() {
        SpySender sender = new SpySender();
        ShipmentStatus broken = trackingNumber -> {
            throw new CarrierUnavailableException("carrier returned 503");
        };
        PackageNotifier notifier =
                new PackageNotifier(broken, sender, new MemoryRecorder(), DUMMY_SLEEPER);

        assertThrows(IOException.class, () -> notifier.notify("TRACK-123"));
        assertEquals(List.of(), sender.messages);
    }

    @Test
    void contractFailureIsNotRetried() {
        int[] calls = {0};
        ShipmentStatus drifted = trackingNumber -> {
            calls[0]++;
            throw new CarrierContractException("no status field");
        };
        PackageNotifier notifier = new PackageNotifier(
                drifted, new SpySender(), new MemoryRecorder(), DUMMY_SLEEPER);

        assertThrows(CarrierContractException.class, () -> notifier.notify("TRACK-123"));
        assertEquals(1, calls[0]);
    }
}
