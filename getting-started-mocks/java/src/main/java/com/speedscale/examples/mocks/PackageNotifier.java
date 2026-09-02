package com.speedscale.examples.mocks;

import java.util.Optional;

public final class PackageNotifier {
    private final CarrierClient carrierClient;

    public PackageNotifier(CarrierClient carrierClient) {
        this.carrierClient = carrierClient;
    }

    public Optional<String> notificationFor(String trackingNumber) {
        String status = carrierClient.getShipmentStatus(trackingNumber);
        if ("delayed".equals(status)) {
            return Optional.of("Package " + trackingNumber + " is delayed");
        }
        return Optional.empty();
    }
}
