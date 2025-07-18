package com.banking.userservice.controller;

import com.banking.userservice.dto.UserRegistrationRequest;
import com.banking.userservice.dto.UserLoginRequest;
import com.banking.userservice.dto.UserLoginResponse;
import com.banking.userservice.dto.UserProfileResponse;
import com.banking.userservice.entity.User;
import com.banking.userservice.service.UserService;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.Tracer;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.validation.BindingResult;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@RestController
@RequestMapping("/api/users")
@CrossOrigin(origins = "*", maxAge = 3600)
public class UserController {

    private static final Logger logger = LoggerFactory.getLogger(UserController.class);

    @Autowired
    private UserService userService;

    @Autowired
    private Tracer tracer;

    /**
     * Register a new user
     * @param request user registration request
     * @param bindingResult validation result
     * @return success response or error
     */
    @PostMapping("/register")
    public ResponseEntity<?> registerUser(@Valid @RequestBody UserRegistrationRequest request,
                                        BindingResult bindingResult) {
        Span span = tracer.spanBuilder("UserController.registerUser").startSpan();
        try {
            logger.info("Registration request for username: {}", request.getUsername());

            // Check for validation errors
            if (bindingResult.hasErrors()) {
                List<String> errors = bindingResult.getFieldErrors()
                        .stream()
                        .map(error -> error.getField() + ": " + error.getDefaultMessage())
                        .collect(Collectors.toList());
                
                Map<String, Object> response = new HashMap<>();
                response.put("success", false);
                response.put("message", "Validation failed");
                response.put("errors", errors);
                
                logger.error("Validation errors for registration: {}", errors);
                return ResponseEntity.badRequest().body(response);
            }

            // Register user
            User user = userService.registerUser(request);

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "User registered successfully");
            response.put("user", new UserProfileResponse(
                    user.getId(),
                    user.getUsername(),
                    user.getEmail(),
                    user.getRoles(),
                    user.getCreatedAt(),
                    user.getUpdatedAt()
            ));

            span.setAttribute("user.id", user.getId());
            span.setAttribute("user.username", user.getUsername());
            span.setAttribute("registration.success", true);

            return ResponseEntity.ok(response);

        } catch (RuntimeException e) {
            span.recordException(e);
            span.setAttribute("registration.success", false);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", e.getMessage());
            
            logger.error("Registration failed: {}", e.getMessage());
            return ResponseEntity.badRequest().body(response);
            
        } finally {
            span.end();
        }
    }

    /**
     * Authenticate user and return JWT token
     * @param request user login request
     * @param bindingResult validation result
     * @return JWT token or error
     */
    @PostMapping("/login")
    public ResponseEntity<?> authenticateUser(@Valid @RequestBody UserLoginRequest request,
                                            BindingResult bindingResult) {
        Span span = tracer.spanBuilder("UserController.authenticateUser").startSpan();
        try {
            logger.info("Login request for: {}", request.getUsernameOrEmail());

            // Check for validation errors
            if (bindingResult.hasErrors()) {
                List<String> errors = bindingResult.getFieldErrors()
                        .stream()
                        .map(error -> error.getField() + ": " + error.getDefaultMessage())
                        .collect(Collectors.toList());
                
                Map<String, Object> response = new HashMap<>();
                response.put("success", false);
                response.put("message", "Validation failed");
                response.put("errors", errors);
                
                logger.error("Validation errors for login: {}", errors);
                return ResponseEntity.badRequest().body(response);
            }

            // Authenticate user
            UserLoginResponse loginResponse = userService.authenticateUser(request);

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Authentication successful");
            response.put("data", loginResponse);

            span.setAttribute("user.id", loginResponse.getId());
            span.setAttribute("user.username", loginResponse.getUsername());
            span.setAttribute("authentication.success", true);

            return ResponseEntity.ok(response);

        } catch (RuntimeException e) {
            span.recordException(e);
            span.setAttribute("authentication.success", false);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", e.getMessage());
            
            logger.error("Authentication failed: {}", e.getMessage());
            return ResponseEntity.badRequest().body(response);
            
        } finally {
            span.end();
        }
    }

    /**
     * Get current user profile
     * @return user profile or error
     */
    @GetMapping("/profile")
    @PreAuthorize("isAuthenticated()")
    public ResponseEntity<?> getUserProfile() {
        Span span = tracer.spanBuilder("UserController.getUserProfile").startSpan();
        try {
            Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
            String username = authentication.getName();
            
            logger.info("Profile request for user: {}", username);

            UserProfileResponse profile = userService.getUserProfile(username);

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("message", "Profile retrieved successfully");
            response.put("data", profile);

            span.setAttribute("user.id", profile.getId());
            span.setAttribute("user.username", profile.getUsername());

            return ResponseEntity.ok(response);

        } catch (RuntimeException e) {
            span.recordException(e);
            
            Map<String, Object> response = new HashMap<>();
            response.put("success", false);
            response.put("message", e.getMessage());
            
            logger.error("Profile retrieval failed: {}", e.getMessage());
            return ResponseEntity.badRequest().body(response);
            
        } finally {
            span.end();
        }
    }

    /**
     * Check if username is available
     * @param username the username to check
     * @return availability status
     */
    @GetMapping("/check-username")
    public ResponseEntity<?> checkUsernameAvailability(@RequestParam String username) {
        Span span = tracer.spanBuilder("UserController.checkUsernameAvailability").startSpan();
        try {
            logger.info("Checking username availability: {}", username);

            boolean exists = userService.usernameExists(username);

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("available", !exists);
            response.put("message", exists ? "Username is not available" : "Username is available");

            span.setAttribute("username", username);
            span.setAttribute("available", !exists);

            return ResponseEntity.ok(response);

        } finally {
            span.end();
        }
    }

    /**
     * Check if email is available
     * @param email the email to check
     * @return availability status
     */
    @GetMapping("/check-email")
    public ResponseEntity<?> checkEmailAvailability(@RequestParam String email) {
        Span span = tracer.spanBuilder("UserController.checkEmailAvailability").startSpan();
        try {
            logger.info("Checking email availability: {}", email);

            boolean exists = userService.emailExists(email);

            Map<String, Object> response = new HashMap<>();
            response.put("success", true);
            response.put("available", !exists);
            response.put("message", exists ? "Email is not available" : "Email is available");

            span.setAttribute("email", email);
            span.setAttribute("available", !exists);

            return ResponseEntity.ok(response);

        } finally {
            span.end();
        }
    }

    /**
     * Health check endpoint
     * @return health status
     */
    @GetMapping("/health")
    public ResponseEntity<?> healthCheck() {
        Map<String, Object> response = new HashMap<>();
        response.put("status", "UP");
        response.put("service", "user-service");
        response.put("timestamp", System.currentTimeMillis());
        
        return ResponseEntity.ok(response);
    }
}