package com.speedscale.mocks.notifier;

import java.time.Duration;

/**
 * The second seam. Production waits between retries. A test does not.
 */
@FunctionalInterface
public interface Sleep {
    void pause(Duration duration) throws InterruptedException;
}
