package com.speedscale.mocks.notifier;

/**
 * The production wiring: the real HTTP carrier goes into the same seam the
 * tests fill with a canned answer.
 */
public final class Main {
    private Main() {}

    public static void main(String[] args) throws Exception {
        if (args.length != 1) {
            System.err.println("usage: notify TRACKING-NUMBER");
            System.exit(2);
        }
        String baseUrl = System.getenv().getOrDefault("CARRIER_URL", "https://api.example-carrier.test");

        PackageNotifier notifier = new PackageNotifier(new HttpShipmentStatus(baseUrl));
        System.out.println(notifier.notify(args[0]).orElse("nothing to send"));
    }
}
