package com.example.auth.repository;

import com.example.auth.model.AuditLog;
import com.example.auth.model.AuditEventType;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;

@Repository
public interface AuditLogRepository extends JpaRepository<AuditLog, Long> {
    
    Page<AuditLog> findByUserId(Long userId, Pageable pageable);
    
    List<AuditLog> findByEventType(AuditEventType eventType);
    
    List<AuditLog> findByCreatedAtBetween(LocalDateTime startDate, LocalDateTime endDate);
    
    List<AuditLog> findByUserIdAndEventTypeAndCreatedAtAfter(Long userId, AuditEventType eventType, LocalDateTime after);
}