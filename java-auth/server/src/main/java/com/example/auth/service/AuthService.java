package com.example.auth.service;

import com.example.auth.dto.LoginRequest;
import com.example.auth.model.User;

public interface AuthService {
    
    User authenticate(LoginRequest loginRequest);
    
    User findByUsername(String username);
    
    User findById(Long userId);
    
    void validateUserCredentials(String username, String password);
}