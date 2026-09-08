package com.speedscale.mocks.notifier;

import java.io.IOException;
import java.time.Duration;

public final class PackageNotifier {
    static final int MAX_ATTEMPTS = 3;
    static final Duration BASE_BACKOFF = Duration.ofMillis(100);

    private final ShipmentStatus status;
    private final Sender sender;
    private final Recorder recorder;
    private final Sleep sleep;

    public PackageNotifier(ShipmentStatus status, Sender sender, Recorder recorder, Sleep sleep) {
        this.status = status;
        this.sender = sender;
        this.recorder = recorder;
        this.sleep = sleep;
    }

    public void notify(String trackingNumber) throws IOException, InterruptedException {
        if (recorder.notified(trackingNumber)) {
            return;
        }
        if (!"delayed".equals(lookup(trackingNumber))) {
            return;
        }

        String message = "Package " + trackingNumber + " is delayed";
        sender.send(trackingNumber, message);
        recorder.record(trackingNumber, message);
    }

    private String lookup(String trackingNumber) throws IOException, InterruptedException {
        IOException lastFailure = null;
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                return status.lookup(trackingNumber);
            } catch (IOException failure) {
                lastFailure = failure;
                if (attempt < MAX_ATTEMPTS) {
                    sleep.pause(BASE_BACKOFF.multipliedBy(1L << (attempt - 1)));
                }
            }
        }
        throw lastFailure;
    }
}
