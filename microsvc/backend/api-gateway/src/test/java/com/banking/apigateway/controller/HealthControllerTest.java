package com.banking.apigateway.controller;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.*;

class HealthControllerTest {

    private HealthController healthController;

    @BeforeEach
    void setUp() {
        healthController = new HealthController();
        ReflectionTestUtils.setField(healthController, "applicationName", "test-api-gateway");
    }

    @Test
    void shouldReturnHealthStatus() {
        var response = healthController.health();
        
        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
        assertNotNull(response.getBody());
        assertEquals("UP", response.getBody().get("status"));
        assertEquals("test-api-gateway", response.getBody().get("service"));
        assertEquals("1.0.0", response.getBody().get("version"));
        assertTrue(response.getBody().containsKey("timestamp"));
    }

    @Test
    void shouldReturnReadinessStatus() {
        var response = healthController.readiness();
        
        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
        assertNotNull(response.getBody());
        assertEquals("READY", response.getBody().get("status"));
        assertEquals("test-api-gateway", response.getBody().get("service"));
        assertTrue(response.getBody().containsKey("timestamp"));
    }

    @Test
    void shouldReturnLivenessStatus() {
        var response = healthController.liveness();
        
        assertNotNull(response);
        assertEquals(200, response.getStatusCode().value());
        assertNotNull(response.getBody());
        assertEquals("ALIVE", response.getBody().get("status"));
        assertEquals("test-api-gateway", response.getBody().get("service"));
        assertTrue(response.getBody().containsKey("timestamp"));
    }
}