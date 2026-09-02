package com.speedscale.mocks.notifier;

import java.io.IOException;
import java.util.Optional;

/** Turns a shipment status into a message worth sending. */
public final class PackageNotifier {
    private final ShipmentStatus status;

    public PackageNotifier(ShipmentStatus status) {
        this.status = status;
    }

    /** Returns the message to send, or empty when nothing needs saying. */
    public Optional<String> notify(String trackingNumber) throws IOException, InterruptedException {
        if ("delayed".equals(status.lookup(trackingNumber))) {
            return Optional.of("Package " + trackingNumber + " is delayed");
        }
        return Optional.empty();
    }
}
