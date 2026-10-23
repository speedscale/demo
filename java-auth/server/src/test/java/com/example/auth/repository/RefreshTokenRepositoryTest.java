package com.example.auth.repository;

import com.example.auth.model.RefreshToken;
import java.time.LocalDateTime;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.session.SqlSessionFactoryBuilder;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.h2.jdbcx.JdbcDataSource;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class RefreshTokenRepositoryTest {
    @Test
    void mapsExpiryAndOwnerForEveryLookup() throws Exception {
        JdbcDataSource dataSource = new JdbcDataSource();
        dataSource.setURL("jdbc:h2:mem:refresh_tokens;MODE=MySQL;DB_CLOSE_DELAY=-1");
        try (var connection = dataSource.getConnection(); var sql = connection.createStatement()) {
            sql.execute("CREATE TABLE users (id BIGINT PRIMARY KEY, username VARCHAR(50), email VARCHAR(100), password_hash VARCHAR(255), created_at TIMESTAMP, updated_at TIMESTAMP, enabled BOOLEAN)");
            sql.execute("CREATE TABLE refresh_tokens (id BIGINT AUTO_INCREMENT PRIMARY KEY, token VARCHAR(255), expires_at TIMESTAMP, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, user_id BIGINT REFERENCES users(id))");
            sql.execute("INSERT INTO users VALUES (7, 'refresh-user', 'refresh@example.com', 'hash', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, TRUE)");
            sql.execute("INSERT INTO refresh_tokens (token, expires_at, user_id) VALUES ('refresh-token', '2030-01-02 03:04:05', 7)");
        }
        Configuration configuration = new Configuration(new Environment("test", new JdbcTransactionFactory(), dataSource));
        configuration.addMapper(UserRepository.class);
        configuration.addMapper(RefreshTokenRepository.class);
        try (SqlSession session = new SqlSessionFactoryBuilder().build(configuration).openSession()) {
            RefreshTokenRepository repository = session.getMapper(RefreshTokenRepository.class);
            RefreshToken token = repository.findByToken("refresh-token").orElseThrow();
            assertEquals(LocalDateTime.of(2030, 1, 2, 3, 4, 5), token.getExpiresAt());
            assertNotNull(token.getCreatedAt());
            assertEquals(7L, token.getUser().getId());
            assertEquals("refresh-user", token.getUser().getUsername());
            assertEquals(token, repository.findById(token.getId()).orElseThrow());
            assertEquals(token, repository.findAll().get(0));
            assertTrue(repository.findByToken("missing").isEmpty());
        }
    }
}
