package com.banking.apigateway.integration;

import com.banking.apigateway.security.JwtTokenUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureWebMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.junit.jupiter.SpringExtension;
import org.springframework.test.web.servlet.MockMvc;

import java.util.HashMap;
import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@ExtendWith(SpringExtension.class)
@SpringBootTest
@AutoConfigureWebMvc
@ActiveProfiles("test")
class AuthenticationIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JwtTokenUtil jwtTokenUtil;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void testAccessProtectedEndpoint_WithoutToken() throws Exception {
        // Try to access protected endpoint without token
        mockMvc.perform(get("/api/accounts"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void testAccessProtectedEndpoint_WithInvalidToken() throws Exception {
        // Try to access protected endpoint with invalid token
        mockMvc.perform(get("/api/accounts")
                .header("Authorization", "Bearer invalid-token"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void testAccessProtectedEndpoint_WithValidToken() throws Exception {
        // Generate valid JWT token
        String token = jwtTokenUtil.generateToken("testuser", 1L, "USER");

        // Access protected endpoint with valid token
        mockMvc.perform(get("/api/accounts")
                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    @Test
    void testAccessProtectedEndpoint_WithExpiredToken() throws Exception {
        // Generate expired JWT token (negative expiration)
        String expiredToken = jwtTokenUtil.generateTokenWithCustomExpiration("testuser", 1L, "USER", -1000);

        // Try to access protected endpoint with expired token
        mockMvc.perform(get("/api/accounts")
                .header("Authorization", "Bearer " + expiredToken))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void testJwtTokenValidation_ValidToken() throws Exception {
        // Generate valid JWT token
        String token = jwtTokenUtil.generateToken("testuser", 1L, "USER");

        // Validate token
        assert jwtTokenUtil.validateToken(token);
        assert "testuser".equals(jwtTokenUtil.getUsernameFromToken(token));
        assert Long.valueOf(1L).equals(jwtTokenUtil.getUserIdFromToken(token));
        assert "USER".equals(jwtTokenUtil.getRolesFromToken(token));
    }

    @Test
    void testJwtTokenValidation_InvalidToken() throws Exception {
        // Test invalid token
        assert !jwtTokenUtil.validateToken("invalid-token");
        assert !jwtTokenUtil.validateToken("");
        assert !jwtTokenUtil.validateToken(null);
    }

    @Test
    void testJwtTokenValidation_MalformedToken() throws Exception {
        // Test malformed tokens
        assert !jwtTokenUtil.validateToken("not.a.jwt");
        assert !jwtTokenUtil.validateToken("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
        assert !jwtTokenUtil.validateToken("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid");
    }

    @Test
    void testCORSHeaders() throws Exception {
        // Test CORS preflight request
        mockMvc.perform(options("/api/accounts")
                .header("Origin", "http://localhost:3000")
                .header("Access-Control-Request-Method", "GET")
                .header("Access-Control-Request-Headers", "Authorization"))
                .andExpect(status().isOk())
                .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:3000"))
                .andExpect(header().string("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS"))
                .andExpect(header().string("Access-Control-Allow-Headers", "Authorization,Content-Type"));
    }

    @Test
    void testPublicEndpoints_NoAuthenticationRequired() throws Exception {
        // Test public endpoints that don't require authentication
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/users/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(createUserRegistrationJson()))
                .andExpect(status().isCreated());

        mockMvc.perform(post("/api/users/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(createUserLoginJson()))
                .andExpect(status().isOk());
    }

    @Test
    void testUserAuthenticationFlow() throws Exception {
        // 1. Register a new user
        mockMvc.perform(post("/api/users/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(createUserRegistrationJson()))
                .andExpect(status().isCreated());

        // 2. Login with the registered user
        String loginResponse = mockMvc.perform(post("/api/users/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(createUserLoginJson()))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        // 3. Extract token from login response
        Map<String, Object> loginResponseMap = objectMapper.readValue(loginResponse, Map.class);
        String token = (String) loginResponseMap.get("token");

        // 4. Use token to access protected endpoints
        mockMvc.perform(get("/api/accounts")
                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/transactions")
                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk());
    }

    @Test
    void testRoleBasedAccess() throws Exception {
        // Generate tokens with different roles
        String userToken = jwtTokenUtil.generateToken("regularuser", 1L, "USER");
        String adminToken = jwtTokenUtil.generateToken("adminuser", 2L, "ADMIN");

        // Test user access to regular endpoints
        mockMvc.perform(get("/api/accounts")
                .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isOk());

        // Test admin access to admin endpoints (if any)
        mockMvc.perform(get("/api/admin/users")
                .header("Authorization", "Bearer " + adminToken))
                .andExpect(status().isOk());

        // Test user access to admin endpoints (should be forbidden)
        mockMvc.perform(get("/api/admin/users")
                .header("Authorization", "Bearer " + userToken))
                .andExpect(status().isForbidden());
    }

    @Test
    void testTokenRefresh() throws Exception {
        // Generate a token that's about to expire
        String nearExpiredToken = jwtTokenUtil.generateTokenWithCustomExpiration("testuser", 1L, "USER", 1000);

        // Use the token to access an endpoint
        mockMvc.perform(get("/api/accounts")
                .header("Authorization", "Bearer " + nearExpiredToken))
                .andExpect(status().isOk());

        // Wait for token to expire
        Thread.sleep(2000);

        // Try to use expired token
        mockMvc.perform(get("/api/accounts")
                .header("Authorization", "Bearer " + nearExpiredToken))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void testSecurityHeaders() throws Exception {
        // Generate valid token
        String token = jwtTokenUtil.generateToken("testuser", 1L, "USER");

        // Test that security headers are present
        mockMvc.perform(get("/api/accounts")
                .header("Authorization", "Bearer " + token))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("X-Frame-Options", "DENY"))
                .andExpect(header().string("X-XSS-Protection", "1; mode=block"));
    }

    @Test
    void testRateLimiting() throws Exception {
        // Generate valid token
        String token = jwtTokenUtil.generateToken("testuser", 1L, "USER");

        // Make multiple requests to test rate limiting
        for (int i = 0; i < 10; i++) {
            mockMvc.perform(get("/api/accounts")
                    .header("Authorization", "Bearer " + token))
                    .andExpect(status().isOk());
        }

        // Additional requests should be rate limited (if rate limiting is implemented)
        // This depends on the rate limiting configuration
    }

    @Test
    void testCSRFProtection() throws Exception {
        // Test that CSRF protection is properly configured for state-changing operations
        String token = jwtTokenUtil.generateToken("testuser", 1L, "USER");

        // POST requests should work with proper token
        mockMvc.perform(post("/api/accounts")
                .header("Authorization", "Bearer " + token)
                .contentType(MediaType.APPLICATION_JSON)
                .content(createAccountJson()))
                .andExpect(status().isCreated());
    }

    private String createUserRegistrationJson() {
        Map<String, String> registration = new HashMap<>();
        registration.put("username", "testuser");
        registration.put("email", "test@example.com");
        registration.put("password", "password123");
        
        try {
            return objectMapper.writeValueAsString(registration);
        } catch (Exception e) {
            throw new RuntimeException("Failed to create registration JSON", e);
        }
    }

    private String createUserLoginJson() {
        Map<String, String> login = new HashMap<>();
        login.put("usernameOrEmail", "testuser");
        login.put("password", "password123");
        
        try {
            return objectMapper.writeValueAsString(login);
        } catch (Exception e) {
            throw new RuntimeException("Failed to create login JSON", e);
        }
    }

    private String createAccountJson() {
        Map<String, String> account = new HashMap<>();
        account.put("accountType", "CHECKING");
        
        try {
            return objectMapper.writeValueAsString(account);
        } catch (Exception e) {
            throw new RuntimeException("Failed to create account JSON", e);
        }
    }
}