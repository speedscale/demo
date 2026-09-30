package com.speedscale.tutorial;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;

@Configuration
class DataSourceConfig {

    @Bean(destroyMethod = "close")
    DataSource dataSource(
            @Value("${DATABASE_URL:postgres://tutorial:tutorial@localhost:5432/tutorial?sslmode=disable}") String url) {
        DatabaseUrl parsed = DatabaseUrl.parse(url);
        HikariConfig config = new HikariConfig();
        config.setJdbcUrl(parsed.jdbcUrl());
        config.setUsername(parsed.username());
        config.setPassword(parsed.password());
        config.setMaximumPoolSize(5);
        config.setMinimumIdle(0);
        // Connect on first use so the app can start before Postgres (or the proxymock mapping) is up.
        config.setInitializationFailTimeout(-1);
        return new HikariDataSource(config);
    }
}
