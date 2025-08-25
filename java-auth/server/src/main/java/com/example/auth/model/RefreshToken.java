package com.example.auth.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class RefreshToken {
    
    private Long id;
    
    private String token;
    
    private User user;
    
    private LocalDateTime expiresAt;
    
    private LocalDateTime createdAt;
}