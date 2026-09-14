package com.speedscale.mocks.notifier;

import java.io.IOException;

public interface Recorder {
    void record(String trackingNumber, String message) throws IOException;

    boolean notified(String trackingNumber) throws IOException;
}
