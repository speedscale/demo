package com.banking.transactionsservice.config;

import io.opentelemetry.api.metrics.Meter;
import io.opentelemetry.api.metrics.MeterProvider;
import io.opentelemetry.api.trace.Tracer;
import io.opentelemetry.api.trace.TracerProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

@Configuration
@Profile("test")
public class TestOpenTelemetryConfig {
    
    @Bean
    public Tracer tracer() {
        return TracerProvider.noop().get("transactions-service-test");
    }
    
    @Bean
    public Meter meter() {
        return MeterProvider.noop().meterBuilder("transactions-service-test").build();
    }
}