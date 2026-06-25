package com.speedscale.repro;

import io.micronaut.scheduling.annotation.Scheduled;
import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.common.AttributeKey;
import io.opentelemetry.api.common.Attributes;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.SpanKind;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.api.trace.propagation.W3CTraceContextPropagator;
import io.opentelemetry.context.propagation.ContextPropagators;
import io.opentelemetry.exporter.otlp.trace.OtlpGrpcSpanExporter;
import io.opentelemetry.sdk.OpenTelemetrySdk;
import io.opentelemetry.sdk.resources.Resource;
import io.opentelemetry.sdk.trace.SdkTracerProvider;
import io.opentelemetry.sdk.trace.export.BatchSpanProcessor;
import jakarta.inject.Singleton;
import java.time.Instant;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Singleton
public class SpanEmitter {
    private static final Logger logger = LoggerFactory.getLogger(SpanEmitter.class);
    private static final String DEFAULT_ENDPOINT = "http://tracing-agent.tracing:4317";
    private static final String DEFAULT_SERVICE_NAME = "micronaut-otel-grpc-repro";

    private final Tracer tracer;
    private final AtomicLong count = new AtomicLong();

    public SpanEmitter() {
        OpenTelemetry openTelemetry = openTelemetry();
        this.tracer = openTelemetry.getTracer("micronaut-otel-grpc-repro");
    }

    @Scheduled(initialDelay = "2s", fixedDelay = "1s")
    void emitScheduledSpan() {
        emitSpan("scheduled");
    }

    long emitSpan(String trigger) {
        long sequence = count.incrementAndGet();
        Span span = tracer.spanBuilder("repro.otlp.grpc.export")
            .setSpanKind(SpanKind.INTERNAL)
            .setAttribute("repro.trigger", trigger)
            .setAttribute("repro.sequence", sequence)
            .setAttribute("repro.time", Instant.now().toString())
            .startSpan();
        try {
            span.addEvent("span.body", Attributes.of(
                AttributeKey.stringKey("message"),
                "plaintext otlp grpc export"
            ));
            logger.info("emitted span sequence={} trigger={}", sequence, trigger);
            return sequence;
        } catch (RuntimeException e) {
            span.recordException(e);
            throw e;
        } finally {
            span.end();
        }
    }

    long count() {
        return count.get();
    }

    private static OpenTelemetry openTelemetry() {
        String endpoint = env("OTEL_EXPORTER_OTLP_ENDPOINT", DEFAULT_ENDPOINT);
        String serviceName = env("OTEL_SERVICE_NAME", DEFAULT_SERVICE_NAME);
        Resource resource = Resource.getDefault().merge(Resource.create(Attributes.of(
            AttributeKey.stringKey("service.name"),
            serviceName,
            AttributeKey.stringKey("service.namespace"),
            "otel-grpc-repro"
        )));

        SdkTracerProvider provider = SdkTracerProvider.builder()
            .setResource(resource)
            .addSpanProcessor(BatchSpanProcessor.builder(OtlpGrpcSpanExporter.builder()
                    .setEndpoint(endpoint)
                    .setTimeout(Duration.ofSeconds(5))
                    .build())
                .setScheduleDelay(Duration.ofMillis(envInt("OTEL_BSP_SCHEDULE_DELAY_MS", 1000)))
                .setMaxQueueSize(envInt("OTEL_BSP_MAX_QUEUE_SIZE", 2048))
                .setMaxExportBatchSize(envInt("OTEL_BSP_MAX_EXPORT_BATCH_SIZE", 512))
                .build())
            .build();

        Runtime.getRuntime().addShutdownHook(new Thread(provider::close));

        return OpenTelemetrySdk.builder()
            .setTracerProvider(provider)
            .setPropagators(ContextPropagators.create(W3CTraceContextPropagator.getInstance()))
            .build();
    }

    private static String env(String name, String fallback) {
        String value = System.getenv(name);
        return value == null || value.isBlank() ? fallback : value;
    }

    private static int envInt(String name, int fallback) {
        String value = System.getenv(name);
        if (value == null || value.isBlank()) {
            return fallback;
        }
        return Integer.parseInt(value);
    }
}
