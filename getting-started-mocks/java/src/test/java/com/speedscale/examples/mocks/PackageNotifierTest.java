package com.speedscale.examples.mocks;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class PackageNotifierTest {
    @Test
    void createsNotificationWhenPackageIsDelayed() {
        CarrierClient carrier = trackingNumber -> "delayed";
        PackageNotifier notifier = new PackageNotifier(carrier);

        assertEquals(
                "Package TRACK-123 is delayed",
                notifier.notificationFor("TRACK-123").orElseThrow());
    }

    @Test
    void createsNoNotificationWhenPackageIsDelivered() {
        CarrierClient carrier = trackingNumber -> "delivered";
        PackageNotifier notifier = new PackageNotifier(carrier);

        assertTrue(notifier.notificationFor("TRACK-123").isEmpty());
    }
}
