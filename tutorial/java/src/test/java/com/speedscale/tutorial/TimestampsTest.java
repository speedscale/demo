package com.speedscale.tutorial;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

class TimestampsTest {

    @Test
    void alwaysHasThreeFractionalDigits() {
        assertThat(Timestamps.format(Instant.parse("2026-09-30T10:44:50Z"))).isEqualTo("2026-09-30T10:44:50.000Z");
        assertThat(Timestamps.format(Instant.parse("2026-09-30T10:44:50.123Z"))).isEqualTo("2026-09-30T10:44:50.123Z");
        assertThat(Timestamps.format(Instant.parse("2026-09-30T10:44:50.100Z"))).isEqualTo("2026-09-30T10:44:50.100Z");
    }

    @Test
    void truncatesInsteadOfRounding() {
        assertThat(Timestamps.format(Instant.parse("2026-09-30T10:44:50.999999Z"))).isEqualTo("2026-09-30T10:44:50.999Z");
        assertThat(Timestamps.format(Instant.parse("2026-09-30T10:44:50.123987654Z"))).isEqualTo("2026-09-30T10:44:50.123Z");
    }
}
