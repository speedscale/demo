package com.speedscale.mocks.notifier;

import java.io.IOException;

/**
 * Delivers one finished message to the customer. It is the third seam, and the
 * first one whose whole point is a side effect rather than an answer.
 */
@FunctionalInterface
public interface Sender {
    void send(String message) throws IOException;
}
