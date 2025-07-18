package com.banking.transactionsservice.config;

import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.metrics.DoubleHistogram;
import io.opentelemetry.api.metrics.Meter;
import jakarta.enterprise.inject.Produces;

public class OtelConfig {

    @Produces
    public Meter meter(OpenTelemetry openTelemetry) {
        return openTelemetry.getMeter("transactions-service-meter");
    }

    @Produces
    public DoubleHistogram depositAmountHistogram(Meter meter) {
        return meter
                .histogramBuilder("transactions.deposit.amount")
                .setDescription("Deposit amount distribution")
                .setUnit("usd")
                .build();
    }

    @Produces
    public DoubleHistogram withdrawAmountHistogram(Meter meter) {
        return meter
                .histogramBuilder("transactions.withdraw.amount")
                .setDescription("Withdrawal amount distribution")
                .setUnit("usd")
                .build();
    }

    @Produces
    public DoubleHistogram transferAmountHistogram(Meter meter) {
        return meter
                .histogramBuilder("transactions.transfer.amount")
                .setDescription("Transfer amount distribution")
                .setUnit("usd")
                .build();
    }
}
