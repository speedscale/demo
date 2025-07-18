package com.banking.apigateway.filter;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.cloud.gateway.filter.GatewayFilter;
import org.springframework.cloud.gateway.filter.factory.AbstractGatewayFilterFactory;
import org.springframework.http.server.reactive.ServerHttpRequest;
import org.springframework.http.server.reactive.ServerHttpResponse;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

@Component
public class RequestResponseLoggingFilter extends AbstractGatewayFilterFactory<RequestResponseLoggingFilter.Config> {

    private static final Logger logger = LoggerFactory.getLogger(RequestResponseLoggingFilter.class);

    public RequestResponseLoggingFilter() {
        super(Config.class);
    }

    @Override
    public GatewayFilter apply(Config config) {
        return (exchange, chain) -> {
            ServerHttpRequest request = exchange.getRequest();
            ServerHttpResponse response = exchange.getResponse();
            
            long startTime = System.currentTimeMillis();
            
            // Log request details
            logger.info("Request: {} {} from {} - User-Agent: {}", 
                request.getMethod(), 
                request.getURI().getPath(), 
                request.getRemoteAddress(),
                request.getHeaders().getFirst("User-Agent"));
            
            return chain.filter(exchange).then(Mono.fromRunnable(() -> {
                long endTime = System.currentTimeMillis();
                long duration = endTime - startTime;
                
                // Log response details
                logger.info("Response: {} {} - Status: {} - Duration: {}ms",
                    request.getMethod(),
                    request.getURI().getPath(),
                    response.getStatusCode(),
                    duration);
            }));
        };
    }

    public static class Config {
        // Configuration properties can be added here if needed
    }
}