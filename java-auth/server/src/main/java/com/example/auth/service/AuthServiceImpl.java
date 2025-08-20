package com.example.auth.service;

import com.example.auth.dto.LoginRequest;
import com.example.auth.exception.BadCredentialsException;
import com.example.auth.exception.UserNotFoundException;
import com.example.auth.model.User;
import com.example.auth.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional
public class AuthServiceImpl implements AuthService {
    
    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    
    @Override
    public User authenticate(LoginRequest loginRequest) {
        log.debug("Authenticating user: {}", loginRequest.getUsername());
        
        User user = findByUsername(loginRequest.getUsername());
        
        if (!user.getEnabled()) {
            throw new BadCredentialsException("Account is disabled");
        }
        
        validateUserCredentials(loginRequest.getUsername(), loginRequest.getPassword());
        
        return user;
    }
    
    @Override
    public User findByUsername(String username) {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> new UserNotFoundException("User not found with username: " + username));
    }
    
    @Override
    public User findById(Long userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new UserNotFoundException("User not found with id: " + userId));
    }
    
    @Override
    public void validateUserCredentials(String username, String password) {
        User user = findByUsername(username);
        
        if (!passwordEncoder.matches(password, user.getPasswordHash())) {
            log.warn("Invalid password attempt for user: {}", username);
            throw new BadCredentialsException("Invalid username or password");
        }
    }
}