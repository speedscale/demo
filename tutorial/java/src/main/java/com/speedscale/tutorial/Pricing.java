package com.speedscale.tutorial;

/** Price by CNCF maturity level, in cents. */
public final class Pricing {

    private Pricing() {
    }

    public static int unitPriceCents(String maturity) {
        if (maturity == null) {
            return 1000;
        }
        return switch (maturity) {
            case "Graduated" -> 1200;
            case "Incubating" -> 800;
            case "Sandbox" -> 500;
            default -> 1000;
        };
    }
}
