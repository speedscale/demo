package com.banking.transactionsservice.config;

import io.opentelemetry.api.OpenTelemetry;
import io.opentelemetry.api.metrics.DoubleHistogram;
import io.opentelemetry.api.metrics.Meter;
import io.opentelemetry.api.trace.Tracer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class OtelConfig {

    @Bean
    public Meter meter(OpenTelemetry openTelemetry) {
        return openTelemetry.getMeter("transactions-service-meter");
    }

    @Bean
    public Tracer tracer(OpenTelemetry openTelemetry) {
        return openTelemetry.getTracer("transactions-service-tracer");
    }

    @Bean
    public DoubleHistogram depositAmountHistogram(Meter meter) {
        return meter
                .histogramBuilder("transactions.deposit.amount")
                .setDescription("Deposit amount distribution")
                .setUnit("usd")
                .build();
    }

    @Bean
    public DoubleHistogram withdrawAmountHistogram(Meter meter) {
        return meter
                .histogramBuilder("transactions.withdraw.amount")
                .setDescription("Withdrawal amount distribution")
                .setUnit("usd")
                .build();
    }

    @Bean
    public DoubleHistogram transferAmountHistogram(Meter meter) {
        return meter
                .histogramBuilder("transactions.transfer.amount")
                .setDescription("Transfer amount distribution")
                .setUnit("usd")
                .build();
    }
}