package com.speedscale.mocks.notifier;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class PackageNotifierTest {
    @Test
    void createsNotificationWhenPackageIsDelayed() throws Exception {
        ShipmentStatus delayed = trackingNumber -> "delayed";
        PackageNotifier notifier = new PackageNotifier(delayed);

        assertEquals(
                "Package TRACK-123 is delayed",
                notifier.notify("TRACK-123").orElseThrow());
    }

    @Test
    void createsNoNotificationWhenPackageIsDelivered() throws Exception {
        ShipmentStatus delivered = trackingNumber -> "delivered";
        PackageNotifier notifier = new PackageNotifier(delivered);

        assertTrue(notifier.notify("TRACK-123").isEmpty());
    }
}
