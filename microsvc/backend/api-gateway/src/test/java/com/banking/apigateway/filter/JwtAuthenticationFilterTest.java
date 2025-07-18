package com.banking.apigateway.filter;

import com.banking.apigateway.security.JwtTokenUtil;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.*;

@ExtendWith(MockitoExtension.class)
class JwtAuthenticationFilterTest {

    @Mock
    private JwtTokenUtil jwtTokenUtil;

    private JwtAuthenticationFilter jwtAuthenticationFilter;

    @BeforeEach
    void setUp() {
        jwtAuthenticationFilter = new JwtAuthenticationFilter();
        // Use reflection to set the private field
        try {
            java.lang.reflect.Field field = JwtAuthenticationFilter.class.getDeclaredField("jwtTokenUtil");
            field.setAccessible(true);
            field.set(jwtAuthenticationFilter, jwtTokenUtil);
        } catch (Exception e) {
            throw new RuntimeException("Failed to set jwtTokenUtil field", e);
        }
    }

    @Test
    void shouldCreateFilterConfiguration() {
        // Given & When
        JwtAuthenticationFilter.Config config = new JwtAuthenticationFilter.Config();
        
        // Then
        assertNotNull(config);
    }

    @Test
    void shouldCreateFilterInstance() {
        // Given & When
        JwtAuthenticationFilter filter = new JwtAuthenticationFilter();
        
        // Then
        assertNotNull(filter);
    }

    @Test
    void shouldApplyConfiguration() {
        // Given
        JwtAuthenticationFilter.Config config = new JwtAuthenticationFilter.Config();
        
        // When
        var gatewayFilter = jwtAuthenticationFilter.apply(config);
        
        // Then
        assertNotNull(gatewayFilter);
    }
}