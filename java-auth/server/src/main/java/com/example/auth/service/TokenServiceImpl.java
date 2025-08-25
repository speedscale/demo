package com.example.auth.service;

import com.example.auth.dto.LoginResponse;
import com.example.auth.dto.TokenRefreshResponse;
import com.example.auth.dto.TokenValidationResponse;
import com.example.auth.exception.InvalidTokenException;
import com.example.auth.model.RefreshToken;
import com.example.auth.model.User;
import com.example.auth.repository.RefreshTokenRepository;
import com.example.auth.security.JwtTokenProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Date;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional
public class TokenServiceImpl implements TokenService {
    
    private final JwtTokenProvider jwtTokenProvider;
    private final RefreshTokenRepository refreshTokenRepository;
    private final AuthService authService;
    
    @Value("${jwt.expiration}")
    private Long jwtExpiration;
    
    @Value("${jwt.refresh-token-expiration}")
    private Long refreshTokenExpiration;
    
    @Override
    public LoginResponse createTokens(User user) {
        log.debug("Creating tokens for user: {}", user.getUsername());
        
        String accessToken = jwtTokenProvider.generateToken(user.getUsername());
        RefreshToken refreshToken = createRefreshToken(user);
        
        return LoginResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken.getToken())
                .tokenType("Bearer")
                .expiresIn(jwtExpiration / 1000)
                .build();
    }
    
    @Override
    public TokenRefreshResponse refreshToken(String refreshTokenStr) {
        log.debug("Refreshing token");
        
        RefreshToken refreshToken = refreshTokenRepository.findByToken(refreshTokenStr)
                .orElseThrow(() -> new InvalidTokenException("Invalid refresh token"));
        
        if (refreshToken.getExpiresAt().isBefore(LocalDateTime.now())) {
            refreshTokenRepository.deleteById(refreshToken.getId());
            throw new InvalidTokenException("Refresh token has expired");
        }
        
        User user = refreshToken.getUser();
        String newAccessToken = jwtTokenProvider.generateToken(user.getUsername());
        
        refreshTokenRepository.deleteById(refreshToken.getId());
        RefreshToken newRefreshToken = createRefreshToken(user);
        
        return TokenRefreshResponse.builder()
                .accessToken(newAccessToken)
                .refreshToken(newRefreshToken.getToken())
                .tokenType("Bearer")
                .expiresIn(jwtExpiration / 1000)
                .build();
    }
    
    @Override
    public TokenValidationResponse validateToken(String token) {
        log.debug("Validating token");
        
        if (!jwtTokenProvider.validateToken(token)) {
            return TokenValidationResponse.builder()
                    .valid(false)
                    .build();
        }
        
        String username = jwtTokenProvider.getUsernameFromToken(token);
        Date expirationDate = jwtTokenProvider.getExpirationDateFromToken(token);
        LocalDateTime expiresAt = expirationDate.toInstant()
                .atZone(ZoneId.systemDefault())
                .toLocalDateTime();
        
        return TokenValidationResponse.builder()
                .valid(true)
                .username(username)
                .expiresAt(expiresAt)
                .build();
    }
    
    @Override
    public void revokeUserTokens(Long userId) {
        log.debug("Revoking all tokens for user: {}", userId);
        refreshTokenRepository.deleteByUserId(userId);
    }
    
    private RefreshToken createRefreshToken(User user) {
        refreshTokenRepository.deleteExpiredTokens(LocalDateTime.now());
        
        RefreshToken refreshToken = new RefreshToken();
        refreshToken.setToken(UUID.randomUUID().toString());
        refreshToken.setUser(user);
        refreshToken.setExpiresAt(LocalDateTime.now().plusSeconds(refreshTokenExpiration / 1000));
        
        refreshTokenRepository.save(refreshToken);
        return refreshToken;
    }
}