package com.example.auth.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;
import java.util.Map;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuditLog {
    
    private Long id;
    
    private Long userId;
    
    private String username;
    
    private AuditEventType eventType;
    
    private String eventStatus;
    
    private String ipAddress;
    
    private String userAgent;
    
    private Map<String, Object> eventDetails;
    
    private LocalDateTime createdAt;
}