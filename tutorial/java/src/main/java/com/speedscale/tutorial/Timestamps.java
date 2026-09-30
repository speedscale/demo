package com.speedscale.tutorial;

import java.time.Instant;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

/** UTC RFC 3339 with exactly three fractional digits and a Z suffix. Truncates, never rounds. */
public final class Timestamps {

    private static final DateTimeFormatter FORMAT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'").withZone(ZoneOffset.UTC);

    private Timestamps() {
    }

    public static String format(Instant instant) {
        return FORMAT.format(instant);
    }
}
