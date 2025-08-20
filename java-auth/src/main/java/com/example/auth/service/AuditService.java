package com.example.auth.service;

import com.example.auth.model.AuditEventType;
import jakarta.servlet.http.HttpServletRequest;

import java.util.Map;

public interface AuditService {
    
    void logEvent(AuditEventType eventType, String eventStatus, Long userId, String username,
                  HttpServletRequest request, Map<String, Object> details);
    
    void logLoginAttempt(String username, HttpServletRequest request);
    
    void logLoginSuccess(Long userId, String username, HttpServletRequest request);
    
    void logLoginFailure(String username, HttpServletRequest request, String reason);
    
    void logTokenValidation(String username, boolean isValid, HttpServletRequest request);
    
    void logTokenRefresh(Long userId, String username, boolean success, HttpServletRequest request);
    
    void logLogout(Long userId, String username, HttpServletRequest request);
}