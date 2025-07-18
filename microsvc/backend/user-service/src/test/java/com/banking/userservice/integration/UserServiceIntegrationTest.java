package com.banking.userservice.integration;

import com.banking.userservice.dto.UserRegistrationRequest;
import com.banking.userservice.dto.UserLoginRequest;
import com.banking.userservice.dto.UserLoginResponse;
import com.banking.userservice.entity.User;
import com.banking.userservice.repository.UserRepository;
import com.banking.userservice.service.UserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.junit.jupiter.SpringExtension;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.*;

@ExtendWith(SpringExtension.class)
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class UserServiceIntegrationTest {

    @Autowired
    private UserService userService;

    @Autowired
    private UserRepository userRepository;

    private UserRegistrationRequest registrationRequest;
    private UserLoginRequest loginRequest;

    @BeforeEach
    void setUp() {
        // Clean up database before each test
        userRepository.deleteAll();

        registrationRequest = new UserRegistrationRequest();
        registrationRequest.setUsername("integrationuser");
        registrationRequest.setEmail("integration@example.com");
        registrationRequest.setPassword("password123");

        loginRequest = new UserLoginRequest();
        loginRequest.setUsernameOrEmail("integrationuser");
        loginRequest.setPassword("password123");
    }

    @Test
    void testUserRegistrationAndLogin_Success() {
        // Test user registration
        User registeredUser = userService.registerUser(registrationRequest);
        
        assertNotNull(registeredUser);
        assertEquals("integrationuser", registeredUser.getUsername());
        assertEquals("integration@example.com", registeredUser.getEmail());
        assertEquals("USER", registeredUser.getRoles());
        assertNotNull(registeredUser.getCreatedAt());
        assertNotNull(registeredUser.getUpdatedAt());

        // Verify user exists in database
        assertTrue(userRepository.existsByUsername("integrationuser"));
        assertTrue(userRepository.existsByEmail("integration@example.com"));

        // Test user login
        UserLoginResponse loginResponse = userService.authenticateUser(loginRequest);
        
        assertNotNull(loginResponse);
        assertNotNull(loginResponse.getToken());
        assertEquals(registeredUser.getId(), loginResponse.getId());
        assertEquals("integrationuser", loginResponse.getUsername());
        assertEquals("integration@example.com", loginResponse.getEmail());
        assertEquals("USER", loginResponse.getRoles());
    }

    @Test
    void testUserRegistration_DuplicateUsername() {
        // Register first user
        userService.registerUser(registrationRequest);

        // Try to register second user with same username
        UserRegistrationRequest duplicateRequest = new UserRegistrationRequest();
        duplicateRequest.setUsername("integrationuser");
        duplicateRequest.setEmail("different@example.com");
        duplicateRequest.setPassword("password123");

        RuntimeException exception = assertThrows(RuntimeException.class, () -> {
            userService.registerUser(duplicateRequest);
        });

        assertEquals("Username already exists", exception.getMessage());
    }

    @Test
    void testUserRegistration_DuplicateEmail() {
        // Register first user
        userService.registerUser(registrationRequest);

        // Try to register second user with same email
        UserRegistrationRequest duplicateRequest = new UserRegistrationRequest();
        duplicateRequest.setUsername("differentuser");
        duplicateRequest.setEmail("integration@example.com");
        duplicateRequest.setPassword("password123");

        RuntimeException exception = assertThrows(RuntimeException.class, () -> {
            userService.registerUser(duplicateRequest);
        });

        assertEquals("Email already exists", exception.getMessage());
    }

    @Test
    void testUserLogin_InvalidCredentials() {
        // Register user
        userService.registerUser(registrationRequest);

        // Try to login with wrong password
        UserLoginRequest wrongPasswordRequest = new UserLoginRequest();
        wrongPasswordRequest.setUsernameOrEmail("integrationuser");
        wrongPasswordRequest.setPassword("wrongpassword");

        RuntimeException exception = assertThrows(RuntimeException.class, () -> {
            userService.authenticateUser(wrongPasswordRequest);
        });

        assertEquals("Invalid credentials", exception.getMessage());
    }

    @Test
    void testUserLogin_NonExistentUser() {
        // Try to login with user that doesn't exist
        UserLoginRequest nonExistentRequest = new UserLoginRequest();
        nonExistentRequest.setUsernameOrEmail("nonexistent");
        nonExistentRequest.setPassword("password123");

        RuntimeException exception = assertThrows(RuntimeException.class, () -> {
            userService.authenticateUser(nonExistentRequest);
        });

        assertEquals("Invalid credentials", exception.getMessage());
    }

    @Test
    void testUserLogin_WithEmail() {
        // Register user
        userService.registerUser(registrationRequest);

        // Login with email instead of username
        UserLoginRequest emailLoginRequest = new UserLoginRequest();
        emailLoginRequest.setUsernameOrEmail("integration@example.com");
        emailLoginRequest.setPassword("password123");

        UserLoginResponse loginResponse = userService.authenticateUser(emailLoginRequest);
        
        assertNotNull(loginResponse);
        assertNotNull(loginResponse.getToken());
        assertEquals("integrationuser", loginResponse.getUsername());
        assertEquals("integration@example.com", loginResponse.getEmail());
    }

    @Test
    void testUsernameExists() {
        // Initially username should not exist
        assertFalse(userService.usernameExists("integrationuser"));

        // Register user
        userService.registerUser(registrationRequest);

        // Now username should exist
        assertTrue(userService.usernameExists("integrationuser"));
    }

    @Test
    void testEmailExists() {
        // Initially email should not exist
        assertFalse(userService.emailExists("integration@example.com"));

        // Register user
        userService.registerUser(registrationRequest);

        // Now email should exist
        assertTrue(userService.emailExists("integration@example.com"));
    }

    @Test
    void testGetUserById() {
        // Register user
        User registeredUser = userService.registerUser(registrationRequest);

        // Get user by ID
        User foundUser = userService.getUserById(registeredUser.getId());
        
        assertNotNull(foundUser);
        assertEquals(registeredUser.getId(), foundUser.getId());
        assertEquals("integrationuser", foundUser.getUsername());
        assertEquals("integration@example.com", foundUser.getEmail());
        assertEquals("USER", foundUser.getRoles());
    }

    @Test
    void testGetUserById_NotFound() {
        // Try to get user that doesn't exist
        RuntimeException exception = assertThrows(RuntimeException.class, () -> {
            userService.getUserById(999L);
        });

        assertEquals("User not found", exception.getMessage());
    }

    @Test
    void testUserProfile() {
        // Register user
        User registeredUser = userService.registerUser(registrationRequest);

        // Get user profile  
        User profile = userService.getUserById(registeredUser.getId());
        
        assertNotNull(profile);
        assertEquals(registeredUser.getId(), profile.getId());
        assertEquals("integrationuser", profile.getUsername());
        assertEquals("integration@example.com", profile.getEmail());
        assertEquals("USER", profile.getRoles());
        
        // Password hash should not be exposed in profile
        assertNull(profile.getPasswordHash());
    }

    @Test
    void testUserProfile_NotFound() {
        // Try to get profile for user that doesn't exist
        RuntimeException exception = assertThrows(RuntimeException.class, () -> {
            userService.getUserById(999L);
        });

        assertEquals("User not found", exception.getMessage());
    }

    @Test
    void testPasswordEncryption() {
        // Register user
        User registeredUser = userService.registerUser(registrationRequest);

        // Get user from database
        User userFromDb = userRepository.findById(registeredUser.getId()).orElse(null);
        
        assertNotNull(userFromDb);
        assertNotNull(userFromDb.getPasswordHash());
        
        // Password should be hashed, not stored in plain text
        assertNotEquals("password123", userFromDb.getPasswordHash());
        
        // Should be able to authenticate with original password
        UserLoginResponse loginResponse = userService.authenticateUser(loginRequest);
        assertNotNull(loginResponse);
    }

    @Test
    void testUserRoles() {
        // Register user
        User registeredUser = userService.registerUser(registrationRequest);

        // Default role should be USER
        assertEquals("USER", registeredUser.getRoles());

        // Login and verify role in token
        UserLoginResponse loginResponse = userService.authenticateUser(loginRequest);
        assertEquals("USER", loginResponse.getRoles());
    }

    @Test
    void testUserTimestamps() {
        // Register user
        User registeredUser = userService.registerUser(registrationRequest);

        // Verify timestamps are set
        assertNotNull(registeredUser.getCreatedAt());
        assertNotNull(registeredUser.getUpdatedAt());
        
        // Created and updated timestamps should be approximately equal for new user
        assertTrue(registeredUser.getCreatedAt().isBefore(registeredUser.getUpdatedAt()) ||
                   registeredUser.getCreatedAt().isEqual(registeredUser.getUpdatedAt()));
    }
}