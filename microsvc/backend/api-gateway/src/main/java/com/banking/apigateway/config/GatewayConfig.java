package com.banking.apigateway.config;

import com.banking.apigateway.filter.JwtAuthenticationFilter;
import com.banking.apigateway.filter.RequestResponseLoggingFilter;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.cloud.gateway.route.builder.RouteLocatorBuilder;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class GatewayConfig {

    @Autowired
    private JwtAuthenticationFilter jwtAuthenticationFilter;

    @Autowired
    private RequestResponseLoggingFilter requestResponseLoggingFilter;

    @Bean
    public RouteLocator routes(RouteLocatorBuilder builder) {
        return builder.routes()
            // User Service Routes
            .route("user-service", r -> r
                .path("/api/users/**")
                .filters(f -> f
                    .filter(requestResponseLoggingFilter.apply(new RequestResponseLoggingFilter.Config()))
                    .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                .uri("${services.user-service.url:http://localhost:8081}"))
            
            // Accounts Service Routes  
            .route("accounts-service", r -> r
                .path("/api/accounts/**")
                .filters(f -> f
                    .filter(requestResponseLoggingFilter.apply(new RequestResponseLoggingFilter.Config()))
                    .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config()))
                    .requestRateLimiter(rl -> rl
                        .setRateLimiter(redisRateLimiter())
                        .setKeyResolver(userKeyResolver())))
                .uri("${services.accounts-service.url:http://localhost:8082}"))
            
            // Transactions Service Routes
            .route("transactions-service", r -> r
                .path("/api/transactions/**")
                .filters(f -> f
                    .filter(requestResponseLoggingFilter.apply(new RequestResponseLoggingFilter.Config()))
                    .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config()))
                    .requestRateLimiter(rl -> rl
                        .setRateLimiter(redisRateLimiter())
                        .setKeyResolver(userKeyResolver())))
                .uri("${services.transactions-service.url:http://localhost:8083}"))
            
            .build();
    }

    @Bean
    public org.springframework.cloud.gateway.filter.ratelimit.RedisRateLimiter redisRateLimiter() {
        return new org.springframework.cloud.gateway.filter.ratelimit.RedisRateLimiter(10, 20, 1);
    }

    @Bean
    public org.springframework.cloud.gateway.filter.ratelimit.KeyResolver userKeyResolver() {
        return exchange -> exchange.getPrincipal()
            .cast(java.security.Principal.class)
            .map(java.security.Principal::getName)
            .switchIfEmpty(reactor.core.publisher.Mono.just("anonymous"));
    }
}