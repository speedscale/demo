package com.speedscale.mocks.notifier;

import java.io.IOException;

/** The carrier answered, but its response no longer matches the expected shape. */
public class CarrierContractException extends IOException {
    public CarrierContractException(String message) {
        super(message);
    }
}
