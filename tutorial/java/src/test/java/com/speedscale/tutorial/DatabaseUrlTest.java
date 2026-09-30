package com.speedscale.tutorial;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DatabaseUrlTest {

    @Test
    void convertsToJdbc() {
        DatabaseUrl url = DatabaseUrl.parse("postgres://tutorial:tutorial@localhost:15432/tutorial?sslmode=disable");
        assertThat(url.jdbcUrl()).isEqualTo("jdbc:postgresql://localhost:15432/tutorial?sslmode=disable&prepareThreshold=0");
        assertThat(url.username()).isEqualTo("tutorial");
        assertThat(url.password()).isEqualTo("tutorial");
    }

    @Test
    void defaultsPortAndDecodesCredentials() {
        DatabaseUrl url = DatabaseUrl.parse("postgresql://me:p%40ss@db.internal/app");
        assertThat(url.jdbcUrl()).isEqualTo("jdbc:postgresql://db.internal:5432/app?prepareThreshold=0");
        assertThat(url.username()).isEqualTo("me");
        assertThat(url.password()).isEqualTo("p@ss");
    }

    @Test
    void rejectsOtherSchemes() {
        assertThatThrownBy(() -> DatabaseUrl.parse("mysql://x@localhost/db")).isInstanceOf(IllegalArgumentException.class);
    }
}
