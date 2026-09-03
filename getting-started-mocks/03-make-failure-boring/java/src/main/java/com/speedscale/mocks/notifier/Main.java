package com.speedscale.mocks.notifier;

/**
 * The production wiring: the real HTTP carrier and a real sleep go into the
 * same seams the tests fill with canned behavior.
 */
public final class Main {
    private Main() {}

    public static void main(String[] args) throws Exception {
        if (args.length != 1) {
            System.err.println("usage: notify TRACKING-NUMBER");
            System.exit(2);
        }
        String baseUrl = System.getenv().getOrDefault("CARRIER_URL", "https://api.example-carrier.test");

        PackageNotifier notifier = new PackageNotifier(
                new HttpShipmentStatus(baseUrl),
                duration -> Thread.sleep(duration.toMillis()));
        System.out.println(notifier.notify(args[0]).orElse("nothing to send"));
    }
}
