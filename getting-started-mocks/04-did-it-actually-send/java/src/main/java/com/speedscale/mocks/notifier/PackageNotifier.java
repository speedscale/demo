package com.speedscale.mocks.notifier;

import java.io.IOException;
import java.time.Duration;

/** Turns a shipment status into a message worth sending. */
public final class PackageNotifier {
    // The retry budget is deliberately a constant. Making it configurable is
    // the exercise at the end of the post.
    static final int MAX_ATTEMPTS = 3;
    static final Duration BACKOFF = Duration.ofMillis(100);

    private final ShipmentStatus status;
    private final Sender sender;
    private final Sleep sleep;

    public PackageNotifier(ShipmentStatus status, Sender sender, Sleep sleep) {
        this.status = status;
        this.sender = sender;
        this.sleep = sleep;
    }

    /**
     * Tells the customer if there is anything worth telling them. It no longer
     * returns the message, so a test cannot check a return value any more.
     */
    public void notify(String trackingNumber) throws IOException, InterruptedException {
        String shipmentStatus = lookup(trackingNumber);
        if ("delayed".equals(shipmentStatus)) {
            sender.send("Package " + trackingNumber + " is delayed");
        }
        // Any other answer, including one we have never heard of, means there
        // is nothing to tell the customer. It must not crash the run.
    }

    /** Asks the carrier, retrying a failure until the budget runs out. */
    private String lookup(String trackingNumber) throws IOException, InterruptedException {
        IOException lastFailure = null;
        for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
                return status.lookup(trackingNumber);
            } catch (IOException failure) {
                lastFailure = failure;
                if (attempt < MAX_ATTEMPTS) {
                    sleep.pause(BACKOFF);
                }
            }
        }
        throw lastFailure;
    }
}
