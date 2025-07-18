package com.banking.apigateway.security;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import static org.junit.jupiter.api.Assertions.*;

class JwtTokenUtilTest {

    private JwtTokenUtil jwtTokenUtil;

    @BeforeEach
    void setUp() {
        jwtTokenUtil = new JwtTokenUtil();
        ReflectionTestUtils.setField(jwtTokenUtil, "jwtSecret", "mySecretKey1234567890123456789012345678901234567890");
        ReflectionTestUtils.setField(jwtTokenUtil, "jwtExpiration", 86400000);
    }

    @Test
    void shouldReturnFalseForInvalidToken() {
        String invalidToken = "invalid.token.here";
        
        Boolean isValid = jwtTokenUtil.validateToken(invalidToken);
        
        assertFalse(isValid);
    }

    @Test
    void shouldReturnFalseForNullToken() {
        String nullToken = null;
        
        Boolean isValid = jwtTokenUtil.validateToken(nullToken);
        
        assertFalse(isValid);
    }

    @Test
    void shouldReturnFalseForEmptyToken() {
        String emptyToken = "";
        
        Boolean isValid = jwtTokenUtil.validateToken(emptyToken);
        
        assertFalse(isValid);
    }

    @Test
    void shouldReturnFalseForMalformedToken() {
        String malformedToken = "malformed.token";
        
        Boolean isValid = jwtTokenUtil.validateToken(malformedToken);
        
        assertFalse(isValid);
    }
}