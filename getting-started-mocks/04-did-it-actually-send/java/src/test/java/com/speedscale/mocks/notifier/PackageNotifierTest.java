package com.speedscale.mocks.notifier;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.http.HttpTimeoutException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class PackageNotifierTest {
    private static final Sleep NO_SLEEP = duration -> {};

    /**
     * A Sender that remembers every message it was asked to deliver. It answers
     * the only question this post cares about: did it actually send?
     */
    private static final class SpySender implements Sender {
        private final List<String> sent = new ArrayList<>();

        @Override
        public void send(String message) {
            sent.add(message);
        }
    }

    @Test
    void sendsOneMessageForADelayedPackage() throws Exception {
        ShipmentStatus delayed = trackingNumber -> "delayed";
        SpySender spy = new SpySender();
        PackageNotifier notifier = new PackageNotifier(delayed, spy, NO_SLEEP);

        notifier.notify("TRACK-123");

        assertEquals(List.of("Package TRACK-123 is delayed"), spy.sent);
    }

    @Test
    void sendsNothingForADeliveredPackage() throws Exception {
        ShipmentStatus delivered = trackingNumber -> "delivered";
        SpySender spy = new SpySender();
        PackageNotifier notifier = new PackageNotifier(delivered, spy, NO_SLEEP);

        notifier.notify("TRACK-123");

        assertTrue(spy.sent.isEmpty());
    }

    @Test
    void sendsNothingWhenTheCarrierIsUnavailable() {
        ShipmentStatus unavailable = trackingNumber -> {
            throw new CarrierUnavailableException("carrier returned 500");
        };
        SpySender spy = new SpySender();
        PackageNotifier notifier = new PackageNotifier(unavailable, spy, NO_SLEEP);

        assertThrows(CarrierUnavailableException.class, () -> notifier.notify("TRACK-123"));
        assertTrue(spy.sent.isEmpty());
    }

    @Test
    void sendsNothingOnTimeout() {
        ShipmentStatus timeout = trackingNumber -> {
            throw new HttpTimeoutException("request timed out");
        };
        SpySender spy = new SpySender();
        PackageNotifier notifier = new PackageNotifier(timeout, spy, NO_SLEEP);

        assertThrows(HttpTimeoutException.class, () -> notifier.notify("TRACK-123"));
        assertTrue(spy.sent.isEmpty());
    }

    @Test
    void sendsNothingForAnUnknownStatus() throws Exception {
        for (String status : new String[] {"", "in_transit", "held_at_customs"}) {
            ShipmentStatus answer = trackingNumber -> status;
            SpySender spy = new SpySender();
            PackageNotifier notifier = new PackageNotifier(answer, spy, NO_SLEEP);

            notifier.notify("TRACK-123");

            assertTrue(spy.sent.isEmpty(), "status " + status);
        }
    }

    @Test
    void retriesThenSends() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        ShipmentStatus flaky = trackingNumber -> {
            if (calls.incrementAndGet() == 1) {
                throw new CarrierUnavailableException("carrier returned 500");
            }
            return "delayed";
        };
        SpySender spy = new SpySender();
        PackageNotifier notifier = new PackageNotifier(flaky, spy, NO_SLEEP);

        notifier.notify("TRACK-123");

        assertEquals(List.of("Package TRACK-123 is delayed"), spy.sent);
    }

    @Test
    void givesUpAfterTheBudget() {
        AtomicInteger calls = new AtomicInteger();
        ShipmentStatus broken = trackingNumber -> {
            calls.incrementAndGet();
            throw new CarrierUnavailableException("carrier returned 500");
        };
        SpySender spy = new SpySender();
        PackageNotifier notifier = new PackageNotifier(broken, spy, NO_SLEEP);

        assertThrows(CarrierUnavailableException.class, () -> notifier.notify("TRACK-123"));
        assertEquals(PackageNotifier.MAX_ATTEMPTS, calls.get());
        assertTrue(spy.sent.isEmpty());
    }
}
