package com.speedscale.mocks.before;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;

/**
 * This is the test we want to write. Against this code it cannot be made to
 * pass on purpose: the test has no way to make the carrier report TRACK-123 as
 * delayed, and the carrier host is not reachable from a laptop anyway.
 *
 * It is disabled so the build stays green. Green because nothing ran is the
 * wrong kind of green; the post explains the fix.
 */
class PackageNotifierTest {
    @Test
    @Disabled("needs a live carrier that will report TRACK-123 as delayed, and the test cannot make that happen")
    void createsNotificationWhenPackageIsDelayed() throws Exception {
        assertEquals(
                "Package TRACK-123 is delayed",
                PackageNotifier.notify("TRACK-123").orElseThrow());
    }
}
