package com.banking.userservice.config;

import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.metrics.LongCounter;
import io.opentelemetry.api.metrics.Meter;
import jakarta.enterprise.inject.Produces;

public class OtelConfig {

    @Produces
    public Meter meter(OpenTelemetry openTelemetry) {
        return openTelemetry.getMeter("user-service-meter");
    }

    @Produces
    public LongCounter registeredUsersCounter(Meter meter) {
        return meter
                .counterBuilder("users.registered")
                .setDescription("Number of registered users")
                .setUnit("1")
                .build();
    }

    @Produces
    public LongCounter successfulLoginsCounter(Meter meter) {
        return meter
                .counterBuilder("users.login.success")
                .setDescription("Number of successful logins")
                .setUnit("1")
                .build();
    }

    @Produces
    public LongCounter failedLoginsCounter(Meter meter) {
        return meter
                .counterBuilder("users.login.failure")
                .setDescription("Number of failed logins")
                .setUnit("1")
                .build();
    }
}
