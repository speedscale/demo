package com.example.auth.controller;

import com.example.auth.dto.*;
import com.example.auth.model.User;
import com.example.auth.service.AuditService;
import com.example.auth.service.AuthService;
import com.example.auth.service.TokenService;
import org.springframework.security.core.Authentication;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Authentication", description = "Authentication management APIs")
public class AuthController {
    
    private final AuthService authService;
    private final TokenService tokenService;
    private final AuditService auditService;
    
    @PostMapping("/login")
    @Operation(summary = "User login", description = "Authenticate user and return JWT tokens")
    @ApiResponses(value = {
        @ApiResponse(responseCode = "200", description = "Login successful"),
        @ApiResponse(responseCode = "401", description = "Invalid credentials"),
        @ApiResponse(responseCode = "400", description = "Bad request")
    })
    public ResponseEntity<LoginResponse> login(
            @Valid @RequestBody LoginRequest loginRequest,
            HttpServletRequest request) {
        
        log.info("Login attempt for user: {}", loginRequest.getUsername());
        auditService.logLoginAttempt(loginRequest.getUsername(), request);
        
        try {
            User user = authService.authenticate(loginRequest);
            LoginResponse response = tokenService.createTokens(user);
            
            auditService.logLoginSuccess(user.getId(), user.getUsername(), request);
            log.info("Login successful for user: {}", user.getUsername());
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            auditService.logLoginFailure(loginRequest.getUsername(), request, e.getMessage());
            throw e;
        }
    }
    
    @PostMapping("/validate")
    @Operation(summary = "Validate token", description = "Validate JWT access token")
    @ApiResponses(value = {
        @ApiResponse(responseCode = "200", description = "Token validation result"),
        @ApiResponse(responseCode = "400", description = "Bad request")
    })
    public ResponseEntity<TokenValidationResponse> validateToken(
            @Valid @RequestBody TokenValidationRequest validationRequest,
            HttpServletRequest request) {
        
        log.debug("Token validation request");
        TokenValidationResponse response = tokenService.validateToken(validationRequest.getToken());
        
        if (response.isValid()) {
            auditService.logTokenValidation(response.getUsername(), true, request);
        } else {
            auditService.logTokenValidation(null, false, request);
        }
        
        return ResponseEntity.ok(response);
    }
    
    @PostMapping("/refresh")
    @Operation(summary = "Refresh token", description = "Refresh JWT access token using refresh token")
    @ApiResponses(value = {
        @ApiResponse(responseCode = "200", description = "Token refreshed successfully"),
        @ApiResponse(responseCode = "401", description = "Invalid refresh token"),
        @ApiResponse(responseCode = "400", description = "Bad request")
    })
    public ResponseEntity<TokenRefreshResponse> refreshToken(
            @Valid @RequestBody TokenRefreshRequest refreshRequest,
            HttpServletRequest request) {
        
        log.debug("Token refresh request");
        
        try {
            TokenRefreshResponse response = tokenService.refreshToken(refreshRequest.getRefreshToken());
            log.info("Token refreshed successfully");
            
            return ResponseEntity.ok(response);
        } catch (Exception e) {
            log.error("Token refresh failed", e);
            throw e;
        }
    }
    
    @PostMapping("/register")
    @Operation(summary = "User registration", description = "Register a new user account")
    @ApiResponses(value = {
        @ApiResponse(responseCode = "201", description = "User registered successfully"),
        @ApiResponse(responseCode = "400", description = "Bad request"),
        @ApiResponse(responseCode = "409", description = "Username or email already exists")
    })
    public ResponseEntity<LoginResponse> register(
            @Valid @RequestBody RegisterRequest registerRequest,
            HttpServletRequest request) {
        
        log.info("Registration attempt for user: {}", registerRequest.getUsername());
        
        try {
            User user = authService.register(registerRequest);
            LoginResponse response = tokenService.createTokens(user);
            
            log.info("Registration successful for user: {}", user.getUsername());
            
            return ResponseEntity.status(HttpStatus.CREATED).body(response);
        } catch (Exception e) {
            log.error("Registration failed for user: {}", registerRequest.getUsername(), e);
            throw e;
        }
    }
    
    @GetMapping("/user")
    @Operation(summary = "Get current user", description = "Get current authenticated user information")
    @ApiResponses(value = {
        @ApiResponse(responseCode = "200", description = "User information retrieved"),
        @ApiResponse(responseCode = "401", description = "Unauthorized")
    })
    public ResponseEntity<UserResponse> getCurrentUser(Authentication authentication) {
        log.debug("Getting user info for: {}", authentication.getName());
        
        User user = authService.findByUsername(authentication.getName());
        
        UserResponse response = new UserResponse();
        response.setId(user.getId());
        response.setUsername(user.getUsername());
        response.setEmail(user.getEmail());
        response.setEnabled(user.getEnabled());
        
        return ResponseEntity.ok(response);
    }
    
    @GetMapping("/health")
    @Operation(summary = "Health check", description = "Check if auth service is running")
    public ResponseEntity<String> health() {
        return ResponseEntity.ok("Auth service is running");
    }
}