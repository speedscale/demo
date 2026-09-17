package com.speedscale.mocks.notifier;

import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/** A fake: a working, stateful implementation of Recorder. */
public final class MemoryRecorder implements Recorder {
    private final Map<String, String> messages = new ConcurrentHashMap<>();

    @Override
    public void record(String trackingNumber, String message) {
        messages.putIfAbsent(trackingNumber, message);
    }

    @Override
    public boolean notified(String trackingNumber) {
        return messages.containsKey(trackingNumber);
    }

    public Optional<String> message(String trackingNumber) {
        return Optional.ofNullable(messages.get(trackingNumber));
    }

    public int count() {
        return messages.size();
    }
}
