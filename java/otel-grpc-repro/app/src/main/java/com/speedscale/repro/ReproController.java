package com.speedscale.repro;

import io.micronaut.http.MediaType;
import io.micronaut.http.annotation.Controller;
import io.micronaut.http.annotation.Get;
import io.micronaut.http.annotation.Produces;
import io.micronaut.http.annotation.QueryValue;
import java.time.Duration;
import java.time.Instant;
import java.util.Map;

@Controller
public class ReproController {
    private final SpanEmitter emitter;

    public ReproController(SpanEmitter emitter) {
        this.emitter = emitter;
    }

    @Get("/health")
    @Produces(MediaType.APPLICATION_JSON)
    Map<String, Object> health() {
        return Map.of("status", "ok", "emitted", emitter.count());
    }

    @Get("/emit")
    @Produces(MediaType.APPLICATION_JSON)
    Map<String, Object> emit() {
        return Map.of("emitted", emitter.emitSpan("http"));
    }

    @Get("/burst{?count}")
    @Produces(MediaType.APPLICATION_JSON)
    Map<String, Object> burst(@QueryValue(defaultValue = "1000") int count) {
        int boundedCount = Math.max(1, Math.min(count, 50_000));
        Instant start = Instant.now();
        long lastSequence = 0;
        for (int i = 0; i < boundedCount; i++) {
            lastSequence = emitter.emitSpan("burst");
        }

        return Map.of(
            "requested", count,
            "emitted", boundedCount,
            "lastSequence", lastSequence,
            "elapsedMillis", Duration.between(start, Instant.now()).toMillis()
        );
    }
}
