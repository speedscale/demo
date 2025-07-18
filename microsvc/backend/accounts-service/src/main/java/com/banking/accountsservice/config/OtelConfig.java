package com.banking.accountsservice.config;

import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.metrics.LongCounter;
import io.opentelemetry.api.metrics.Meter;
import jakarta.enterprise.inject.Produces;

public class OtelConfig {

    @Produces
    public Meter meter(OpenTelemetry openTelemetry) {
        return openTelemetry.getMeter("accounts-service-meter");
    }

    @Produces
    public LongCounter createdAccountsCounter(Meter meter) {
        return meter
                .counterBuilder("accounts.created")
                .setDescription("Number of created accounts")
                .setUnit("1")
                .build();
    }
}
