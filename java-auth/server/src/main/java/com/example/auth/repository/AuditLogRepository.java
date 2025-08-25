package com.example.auth.repository;

import com.example.auth.model.AuditLog;
import com.example.auth.model.AuditEventType;
import org.apache.ibatis.annotations.*;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Mapper
@Repository
public interface AuditLogRepository {
    
    @Select("SELECT id, user_id, event_type, event_details, ip_address, created_at FROM audit_logs WHERE user_id = #{userId} ORDER BY created_at DESC LIMIT #{limit} OFFSET #{offset}")
    List<AuditLog> findByUserIdPaginated(@Param("userId") Long userId, @Param("offset") int offset, @Param("limit") int limit);
    
    @Select("SELECT id, user_id, event_type, event_details, ip_address, created_at FROM audit_logs WHERE event_type = #{eventType}")
    List<AuditLog> findByEventType(AuditEventType eventType);
    
    @Select("SELECT id, user_id, event_type, event_details, ip_address, created_at FROM audit_logs WHERE created_at BETWEEN #{startDate} AND #{endDate}")
    List<AuditLog> findByCreatedAtBetween(LocalDateTime startDate, LocalDateTime endDate);
    
    @Select("SELECT id, user_id, event_type, event_details, ip_address, created_at FROM audit_logs WHERE user_id = #{userId} AND event_type = #{eventType} AND created_at > #{after}")
    List<AuditLog> findByUserIdAndEventTypeAndCreatedAtAfter(Long userId, AuditEventType eventType, LocalDateTime after);
    
    @Insert("INSERT INTO audit_logs (user_id, event_type, event_details, ip_address, created_at) VALUES (#{userId}, #{eventType}, #{eventDetails}, #{ipAddress}, NOW())")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int save(AuditLog auditLog);
    
    @Select("SELECT id, user_id, event_type, event_details, ip_address, created_at FROM audit_logs WHERE id = #{id}")
    Optional<AuditLog> findById(Long id);
    
    @Select("SELECT id, user_id, event_type, event_details, ip_address, created_at FROM audit_logs")
    List<AuditLog> findAll();
    
    @Delete("DELETE FROM audit_logs WHERE id = #{id}")
    int deleteById(Long id);
}