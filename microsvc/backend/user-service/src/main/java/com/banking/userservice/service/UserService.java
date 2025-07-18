package com.banking.userservice.service;

import com.banking.userservice.dto.UserRegistrationRequest;
import com.banking.userservice.dto.UserLoginRequest;
import com.banking.userservice.dto.UserLoginResponse;
import com.banking.userservice.dto.UserProfileResponse;
import com.banking.userservice.entity.User;
import com.banking.userservice.repository.UserRepository;
import com.banking.userservice.security.JwtTokenUtil;
import io.opentelemetry.api.trace.Span;
import io.opentelemetry.api.trace.Tracer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Optional;

@Service
@Transactional
public class UserService {

    private static final Logger logger = LoggerFactory.getLogger(UserService.class);

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PasswordEncoder passwordEncoder;

    @Autowired
    private JwtTokenUtil jwtTokenUtil;

    @Autowired
    private Tracer tracer;

    /**
     * Register a new user
     * @param request user registration request
     * @return the created user
     * @throws RuntimeException if username or email already exists
     */
    public User registerUser(UserRegistrationRequest request) {
        Span span = tracer.spanBuilder("UserService.registerUser").startSpan();
        try {
            logger.info("Registering new user: {}", request.getUsername());

            // Check if username already exists
            if (userRepository.existsByUsername(request.getUsername())) {
                logger.error("Username already exists: {}", request.getUsername());
                throw new RuntimeException("Username already exists");
            }

            // Check if email already exists
            if (userRepository.existsByEmail(request.getEmail())) {
                logger.error("Email already exists: {}", request.getEmail());
                throw new RuntimeException("Email already exists");
            }

            // Create new user
            User user = new User();
            user.setUsername(request.getUsername());
            user.setEmail(request.getEmail());
            user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
            user.setRoles("USER");

            User savedUser = userRepository.save(user);
            logger.info("User registered successfully: {}", savedUser.getUsername());
            
            span.setAttribute("user.id", savedUser.getId());
            span.setAttribute("user.username", savedUser.getUsername());
            
            return savedUser;
            
        } catch (Exception e) {
            span.recordException(e);
            throw e;
        } finally {
            span.end();
        }
    }

    /**
     * Authenticate user and generate JWT token
     * @param request user login request
     * @return login response with JWT token
     * @throws RuntimeException if authentication fails
     */
    public UserLoginResponse authenticateUser(UserLoginRequest request) {
        Span span = tracer.spanBuilder("UserService.authenticateUser").startSpan();
        try {
            logger.info("Authenticating user: {}", request.getUsernameOrEmail());

            // Find user by username or email
            Optional<User> userOptional = userRepository.findByUsernameOrEmail(
                    request.getUsernameOrEmail(), request.getUsernameOrEmail());

            if (userOptional.isEmpty()) {
                logger.error("User not found: {}", request.getUsernameOrEmail());
                throw new RuntimeException("Invalid credentials");
            }

            User user = userOptional.get();

            // Verify password
            if (!passwordEncoder.matches(request.getPassword(), user.getPasswordHash())) {
                logger.error("Invalid password for user: {}", user.getUsername());
                throw new RuntimeException("Invalid credentials");
            }

            // Generate JWT token
            String token = jwtTokenUtil.generateToken(user.getUsername(), user.getId(), user.getRoles());

            logger.info("User authenticated successfully: {}", user.getUsername());
            
            span.setAttribute("user.id", user.getId());
            span.setAttribute("user.username", user.getUsername());
            span.setAttribute("authentication.success", true);

            return new UserLoginResponse(token, user.getId(), user.getUsername(), user.getEmail(), user.getRoles());
            
        } catch (Exception e) {
            span.recordException(e);
            span.setAttribute("authentication.success", false);
            throw e;
        } finally {
            span.end();
        }
    }

    /**
     * Get user profile by username
     * @param username the username
     * @return user profile response
     * @throws RuntimeException if user not found
     */
    @Transactional(readOnly = true)
    public UserProfileResponse getUserProfile(String username) {
        Span span = tracer.spanBuilder("UserService.getUserProfile").startSpan();
        try {
            logger.info("Getting profile for user: {}", username);

            Optional<User> userOptional = userRepository.findByUsername(username);
            if (userOptional.isEmpty()) {
                logger.error("User not found: {}", username);
                throw new RuntimeException("User not found");
            }

            User user = userOptional.get();
            
            span.setAttribute("user.id", user.getId());
            span.setAttribute("user.username", user.getUsername());

            return new UserProfileResponse(
                    user.getId(),
                    user.getUsername(),
                    user.getEmail(),
                    user.getRoles(),
                    user.getCreatedAt(),
                    user.getUpdatedAt()
            );
            
        } catch (Exception e) {
            span.recordException(e);
            throw e;
        } finally {
            span.end();
        }
    }

    /**
     * Get user by ID
     * @param userId the user ID
     * @return user entity
     * @throws RuntimeException if user not found
     */
    @Transactional(readOnly = true)
    public User getUserById(Long userId) {
        Span span = tracer.spanBuilder("UserService.getUserById").startSpan();
        try {
            logger.info("Getting user by ID: {}", userId);
            
            Optional<User> userOptional = userRepository.findById(userId);
            if (userOptional.isEmpty()) {
                logger.error("User not found with ID: {}", userId);
                throw new RuntimeException("User not found");
            }

            User user = userOptional.get();
            span.setAttribute("user.id", user.getId());
            span.setAttribute("user.username", user.getUsername());
            
            return user;
            
        } catch (Exception e) {
            span.recordException(e);
            throw e;
        } finally {
            span.end();
        }
    }

    /**
     * Check if username exists
     * @param username the username to check
     * @return true if exists, false otherwise
     */
    @Transactional(readOnly = true)
    public boolean usernameExists(String username) {
        return userRepository.existsByUsername(username);
    }

    /**
     * Check if email exists
     * @param email the email to check
     * @return true if exists, false otherwise
     */
    @Transactional(readOnly = true)
    public boolean emailExists(String email) {
        return userRepository.existsByEmail(email);
    }
}