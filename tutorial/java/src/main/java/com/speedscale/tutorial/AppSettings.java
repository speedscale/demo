package com.speedscale.tutorial;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

import java.time.Clock;

/** Behavior switches from the environment (see contract/SPEC.md). */
public record AppSettings(String version, boolean slow) {

    public boolean isV2() {
        return "v2".equals(version);
    }

    @Configuration
    static class Config {
        @Bean
        AppSettings appSettings(Environment env) {
            return new AppSettings(env.getProperty("APP_VERSION", "v1"), "1".equals(env.getProperty("APP_SLOW", "0")));
        }

        @Bean
        Clock clock() {
            return Clock.systemUTC();
        }
    }
}
