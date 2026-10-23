package com.example.auth.repository;

import com.example.auth.model.RefreshToken;
import org.apache.ibatis.annotations.*;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

@Mapper
@Repository
public interface RefreshTokenRepository {
    
    @Select("SELECT id, token, expires_at, created_at, user_id FROM refresh_tokens WHERE token = #{token}")
    @Results(id = "refreshToken", value = {
        @Result(column = "id", property = "id", id = true),
        @Result(column = "expires_at", property = "expiresAt"),
        @Result(column = "created_at", property = "createdAt"),
        @Result(column = "user_id", property = "user",
                one = @One(select = "com.example.auth.repository.UserRepository.findById"))
    })
    Optional<RefreshToken> findByToken(String token);
    
    @Delete("DELETE FROM refresh_tokens WHERE expires_at < #{now}")
    int deleteExpiredTokens(LocalDateTime now);
    
    @Delete("DELETE FROM refresh_tokens WHERE user_id = #{userId}")
    int deleteByUserId(Long userId);
    
    @Insert("INSERT INTO refresh_tokens (token, expires_at, user_id) VALUES (#{token}, #{expiresAt}, #{user.id})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int save(RefreshToken refreshToken);
    
    @Select("SELECT id, token, expires_at, created_at, user_id FROM refresh_tokens WHERE id = #{id}")
    @ResultMap("refreshToken")
    Optional<RefreshToken> findById(Long id);
    
    @Select("SELECT id, token, expires_at, created_at, user_id FROM refresh_tokens")
    @ResultMap("refreshToken")
    List<RefreshToken> findAll();
    
    @Delete("DELETE FROM refresh_tokens WHERE id = #{id}")
    int deleteById(Long id);
}