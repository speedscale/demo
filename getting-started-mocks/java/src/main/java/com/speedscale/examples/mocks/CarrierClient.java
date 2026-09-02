package com.speedscale.examples.mocks;

@FunctionalInterface
public interface CarrierClient {
    String getShipmentStatus(String trackingNumber);
}
