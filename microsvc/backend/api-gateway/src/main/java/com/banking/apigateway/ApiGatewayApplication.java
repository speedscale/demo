package com.banking.apigateway;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.gateway.route.RouteLocator;
import org.springframework.cloud.gateway.route.builder.RouteLocatorBuilder;
import org.springframework.context.annotation.Bean;

@SpringBootApplication
public class ApiGatewayApplication {

    public static void main(String[] args) {
        SpringApplication.run(ApiGatewayApplication.class, args);
    }

    @Bean
    public RouteLocator customRouteLocator(RouteLocatorBuilder builder) {
        return builder.routes()
            // User Service Routes
            .route("user-service", r -> r.path("/api/users/**")
                .uri("${services.user-service.url:http://localhost:8081}"))
            
            // Accounts Service Routes
            .route("accounts-service", r -> r.path("/api/accounts/**")
                .uri("${services.accounts-service.url:http://localhost:8082}"))
            
            // Transactions Service Routes
            .route("transactions-service", r -> r.path("/api/transactions/**")
                .uri("${services.transactions-service.url:http://localhost:8083}"))
            
            .build();
    }
}