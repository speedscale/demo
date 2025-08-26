package com.example.auth.repository;

import com.example.auth.model.User;
import org.apache.ibatis.annotations.*;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Mapper
@Repository
public interface UserRepository {
    
    @Select("SELECT id, username, email, password_hash, created_at, updated_at, enabled FROM users WHERE username = #{username}")
    @Results({
        @Result(column = "password_hash", property = "passwordHash"),
        @Result(column = "created_at", property = "createdAt"),
        @Result(column = "updated_at", property = "updatedAt")
    })
    Optional<User> findByUsername(String username);
    
    @Select("SELECT id, username, email, password_hash, created_at, updated_at, enabled FROM users WHERE email = #{email}")
    @Results({
        @Result(column = "password_hash", property = "passwordHash"),
        @Result(column = "created_at", property = "createdAt"),
        @Result(column = "updated_at", property = "updatedAt")
    })
    Optional<User> findByEmail(String email);
    
    @Select("SELECT COUNT(*) > 0 FROM users WHERE username = #{username}")
    boolean existsByUsername(String username);
    
    @Select("SELECT COUNT(*) > 0 FROM users WHERE email = #{email}")
    boolean existsByEmail(String email);
    
    @Insert("INSERT INTO users (username, email, password_hash, created_at, updated_at, enabled) " +
            "VALUES (#{username}, #{email}, #{passwordHash}, NOW(), NOW(), #{enabled})")
    @Options(useGeneratedKeys = true, keyProperty = "id")
    int save(User user);
    
    @Select("SELECT id, username, email, password_hash, created_at, updated_at, enabled FROM users WHERE id = #{id}")
    @Results({
        @Result(column = "password_hash", property = "passwordHash"),
        @Result(column = "created_at", property = "createdAt"),
        @Result(column = "updated_at", property = "updatedAt")
    })
    Optional<User> findById(Long id);
    
    @Select("SELECT id, username, email, password_hash, created_at, updated_at, enabled FROM users")
    @Results({
        @Result(column = "password_hash", property = "passwordHash"),
        @Result(column = "created_at", property = "createdAt"),
        @Result(column = "updated_at", property = "updatedAt")
    })
    List<User> findAll();
    
    @Delete("DELETE FROM users WHERE id = #{id}")
    int deleteById(Long id);
}