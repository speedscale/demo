package com.speedscale.mocks.notifier;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;

class PackageNotifierTest {
    // NO_SLEEP is the whole reason the sleep seam exists. The retry tests below
    // finish instantly instead of waiting for real backoff.
    private static final Sleep NO_SLEEP = duration -> {};

    @Test
    void createsNotificationWhenPackageIsDelayed() throws Exception {
        ShipmentStatus delayed = trackingNumber -> "delayed";
        PackageNotifier notifier = new PackageNotifier(delayed, NO_SLEEP);

        assertEquals(
                "Package TRACK-123 is delayed",
                notifier.notify("TRACK-123").orElseThrow());
    }

    @Test
    void createsNoNotificationWhenPackageIsDelivered() throws Exception {
        ShipmentStatus delivered = trackingNumber -> "delivered";
        PackageNotifier notifier = new PackageNotifier(delivered, NO_SLEEP);

        assertTrue(notifier.notify("TRACK-123").isEmpty());
    }

    @Test
    void reportsCarrierUnavailable() {
        ShipmentStatus unavailable = trackingNumber -> {
            throw new CarrierUnavailableException("carrier returned 500");
        };
        PackageNotifier notifier = new PackageNotifier(unavailable, NO_SLEEP);

        assertThrows(CarrierUnavailableException.class, () -> notifier.notify("TRACK-123"));
    }

    @Test
    void reportsTimeout() {
        ShipmentStatus timeout = trackingNumber -> {
            throw new HttpTimeoutException("request timed out");
        };
        PackageNotifier notifier = new PackageNotifier(timeout, NO_SLEEP);

        assertThrows(HttpTimeoutException.class, () -> notifier.notify("TRACK-123"));
    }

    @Test
    void ignoresAnUnknownStatus() throws Exception {
        for (String status : new String[] {"", "in_transit", "held_at_customs"}) {
            ShipmentStatus answer = trackingNumber -> status;
            PackageNotifier notifier = new PackageNotifier(answer, NO_SLEEP);

            assertTrue(notifier.notify("TRACK-123").isEmpty(), "status " + status);
        }
    }

    @Test
    void retriesUntilTheCarrierAnswers() throws Exception {
        AtomicInteger calls = new AtomicInteger();
        ShipmentStatus flaky = trackingNumber -> {
            if (calls.incrementAndGet() == 1) {
                throw new CarrierUnavailableException("carrier returned 500");
            }
            return "delayed";
        };
        AtomicInteger sleeps = new AtomicInteger();
        PackageNotifier notifier = new PackageNotifier(flaky, duration -> sleeps.incrementAndGet());

        assertEquals(
                "Package TRACK-123 is delayed",
                notifier.notify("TRACK-123").orElseThrow());
        assertEquals(2, calls.get());
        assertEquals(1, sleeps.get());
    }

    @Test
    void givesUpAfterTheBudget() {
        AtomicInteger calls = new AtomicInteger();
        ShipmentStatus broken = trackingNumber -> {
            calls.incrementAndGet();
            throw new CarrierUnavailableException("carrier returned 500");
        };
        PackageNotifier notifier = new PackageNotifier(broken, NO_SLEEP);

        assertThrows(CarrierUnavailableException.class, () -> notifier.notify("TRACK-123"));
        assertEquals(PackageNotifier.MAX_ATTEMPTS, calls.get());
    }
}
