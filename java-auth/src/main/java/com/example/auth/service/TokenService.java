package com.example.auth.service;

import com.example.auth.dto.LoginResponse;
import com.example.auth.dto.TokenRefreshResponse;
import com.example.auth.dto.TokenValidationResponse;
import com.example.auth.model.User;

public interface TokenService {
    
    LoginResponse createTokens(User user);
    
    TokenRefreshResponse refreshToken(String refreshToken);
    
    TokenValidationResponse validateToken(String token);
    
    void revokeUserTokens(Long userId);
}