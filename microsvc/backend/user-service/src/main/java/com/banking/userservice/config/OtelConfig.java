package com.banking.userservice.config;

import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.metrics.LongCounter;
import io.opentelemetry.api.metrics.Meter;
import io.opentelemetry.api.trace.Tracer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OtelConfig {

    @Bean
    public Meter meter(OpenTelemetry openTelemetry) {
        return openTelemetry.getMeter("user-service-meter");
    }

    @Bean
    public Tracer tracer(OpenTelemetry openTelemetry) {
        return openTelemetry.getTracer("user-service-tracer");
    }

    @Bean
    public LongCounter registeredUsersCounter(Meter meter) {
        return meter
                .counterBuilder("users.registered")
                .setDescription("Number of registered users")
                .setUnit("1")
                .build();
    }

    @Bean
    public LongCounter successfulLoginsCounter(Meter meter) {
        return meter
                .counterBuilder("users.login.success")
                .setDescription("Number of successful logins")
                .setUnit("1")
                .build();
    }

    @Bean
    public LongCounter failedLoginsCounter(Meter meter) {
        return meter
                .counterBuilder("users.login.failure")
                .setDescription("Number of failed logins")
                .setUnit("1")
                .build();
    }
}