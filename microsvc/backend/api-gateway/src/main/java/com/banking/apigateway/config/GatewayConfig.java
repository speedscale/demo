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
            // User Service Routes - Public endpoints
            .route("user-service-public", r -> r
                .path("/api/users/register", "/api/users/login", "/api/users/check-username", "/api/users/check-email", "/api/users/health")
                .filters(f -> f
                    .filter(requestResponseLoggingFilter.apply(new RequestResponseLoggingFilter.Config())))
                .uri("http://user-service:8080"))
            
            // User Service Routes - Protected endpoints
            .route("user-service-protected", r -> r
                .path("/api/users/**")
                .filters(f -> f
                    .filter(requestResponseLoggingFilter.apply(new RequestResponseLoggingFilter.Config()))
                    .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                .uri("http://user-service:8080"))
            
            // Accounts Service Routes - Public endpoints
            .route("accounts-service-public", r -> r
                .path("/api/accounts/health")
                .filters(f -> f
                    .filter(requestResponseLoggingFilter.apply(new RequestResponseLoggingFilter.Config())))
                .uri("http://accounts-service:8080"))
            
            // Accounts Service Routes - Protected endpoints  
            .route("accounts-service-protected", r -> r
                .path("/api/accounts/**")
                .filters(f -> f
                    .filter(requestResponseLoggingFilter.apply(new RequestResponseLoggingFilter.Config()))
                    .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                .uri("http://accounts-service:8080"))
            
            // Transactions Service Routes - Public endpoints
            .route("transactions-service-public", r -> r
                .path("/api/transactions/health")
                .filters(f -> f
                    .filter(requestResponseLoggingFilter.apply(new RequestResponseLoggingFilter.Config())))
                .uri("http://transactions-service:8080"))
            
            // Transactions Service Routes - Protected endpoints
            .route("transactions-service-protected", r -> r
                .path("/api/transactions/**")
                .filters(f -> f
                    .filter(requestResponseLoggingFilter.apply(new RequestResponseLoggingFilter.Config()))
                    .filter(jwtAuthenticationFilter.apply(new JwtAuthenticationFilter.Config())))
                .uri("http://transactions-service:8080"))
            
            .build();
    }

    // Rate limiting disabled for now - Redis rate limiter beans removed
}