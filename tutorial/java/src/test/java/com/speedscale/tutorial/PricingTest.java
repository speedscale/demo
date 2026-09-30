package com.speedscale.tutorial;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class PricingTest {

    @Test
    void pricesByMaturity() {
        assertThat(Pricing.unitPriceCents("Graduated")).isEqualTo(1200);
        assertThat(Pricing.unitPriceCents("Incubating")).isEqualTo(800);
        assertThat(Pricing.unitPriceCents("Sandbox")).isEqualTo(500);
        assertThat(Pricing.unitPriceCents("Archived")).isEqualTo(1000);
        assertThat(Pricing.unitPriceCents("graduated")).isEqualTo(1000);
        assertThat(Pricing.unitPriceCents(null)).isEqualTo(1000);
    }
}
