package com.speedscale.mocks.notifier;

import java.io.IOException;

/**
 * Answers "where is this package?" for one tracking number.
 *
 * This is the seam. Production wires it to the carrier's HTTP API (see
 * {@link HttpShipmentStatus}). A test hands in whatever answer it needs.
 */
@FunctionalInterface
public interface ShipmentStatus {
    String lookup(String trackingNumber) throws IOException, InterruptedException;
}
