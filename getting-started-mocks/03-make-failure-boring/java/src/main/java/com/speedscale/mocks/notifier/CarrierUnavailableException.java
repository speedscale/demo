package com.speedscale.mocks.notifier;

import java.io.IOException;

/**
 * Thrown when the carrier is reachable but refuses to answer. This is the HTTP
 * 500 case, not a network failure.
 */
public class CarrierUnavailableException extends IOException {
    public CarrierUnavailableException(String message) {
        super(message);
    }
}
