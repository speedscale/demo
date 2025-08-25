package com.example.auth.service;

import com.example.auth.model.AuditEventType;
import com.example.auth.model.AuditLog;
import com.example.auth.repository.AuditLogRepository;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
@Transactional
public class AuditServiceImpl implements AuditService {
    
    private final AuditLogRepository auditLogRepository;
    
    @Override
    @Async
    public void logEvent(AuditEventType eventType, String eventStatus, Long userId, String username,
                         HttpServletRequest request, Map<String, Object> details) {
        try {
            AuditLog auditLog = AuditLog.builder()
                    .userId(userId)
                    .username(username)
                    .eventType(eventType)
                    .eventStatus(eventStatus)
                    .ipAddress(getClientIp(request))
                    .userAgent(request.getHeader("User-Agent"))
                    .eventDetails(details)
                    .build();
            
            auditLogRepository.save(auditLog);
            log.debug("Audit log created for event: {} with status: {}", eventType, eventStatus);
        } catch (Exception e) {
            log.error("Failed to create audit log", e);
        }
    }
    
    @Override
    public void logLoginAttempt(String username, HttpServletRequest request) {
        Map<String, Object> details = new HashMap<>();
        details.put("action", "login_attempt");
        logEvent(AuditEventType.LOGIN_ATTEMPT, "INITIATED", null, username, request, details);
    }
    
    @Override
    public void logLoginSuccess(Long userId, String username, HttpServletRequest request) {
        Map<String, Object> details = new HashMap<>();
        details.put("action", "login_success");
        logEvent(AuditEventType.LOGIN_SUCCESS, "SUCCESS", userId, username, request, details);
    }
    
    @Override
    public void logLoginFailure(String username, HttpServletRequest request, String reason) {
        Map<String, Object> details = new HashMap<>();
        details.put("action", "login_failure");
        details.put("reason", reason);
        logEvent(AuditEventType.LOGIN_FAILURE, "FAILED", null, username, request, details);
    }
    
    @Override
    public void logTokenValidation(String username, boolean isValid, HttpServletRequest request) {
        Map<String, Object> details = new HashMap<>();
        details.put("action", "token_validation");
        details.put("valid", isValid);
        logEvent(AuditEventType.TOKEN_VALIDATED, isValid ? "SUCCESS" : "FAILED", null, username, request, details);
    }
    
    @Override
    public void logTokenRefresh(Long userId, String username, boolean success, HttpServletRequest request) {
        Map<String, Object> details = new HashMap<>();
        details.put("action", "token_refresh");
        AuditEventType eventType = success ? AuditEventType.TOKEN_REFRESHED : AuditEventType.TOKEN_REFRESH_FAILED;
        logEvent(eventType, success ? "SUCCESS" : "FAILED", userId, username, request, details);
    }
    
    @Override
    public void logLogout(Long userId, String username, HttpServletRequest request) {
        Map<String, Object> details = new HashMap<>();
        details.put("action", "logout");
        logEvent(AuditEventType.LOGOUT, "SUCCESS", userId, username, request, details);
    }
    
    private String getClientIp(HttpServletRequest request) {
        String xForwardedFor = request.getHeader("X-Forwarded-For");
        if (xForwardedFor != null && !xForwardedFor.isEmpty()) {
            return xForwardedFor.split(",")[0].trim();
        }
        
        String xRealIp = request.getHeader("X-Real-IP");
        if (xRealIp != null && !xRealIp.isEmpty()) {
            return xRealIp;
        }
        
        return request.getRemoteAddr();
    }
}