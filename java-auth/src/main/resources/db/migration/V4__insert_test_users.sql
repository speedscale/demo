-- Insert test users with BCrypt hashed passwords
-- Default password for all test users is: password123

INSERT INTO users (username, email, password_hash, enabled) VALUES
('admin', 'admin@example.com', '$2a$10$mTfPnL3qKPY3zYQX5H.LVeKxGHkB5VQZPvEPYGDZlYxI/IQ/4V7y6', true),
('testuser', 'testuser@example.com', '$2a$10$mTfPnL3qKPY3zYQX5H.LVeKxGHkB5VQZPvEPYGDZlYxI/IQ/4V7y6', true),
('johndoe', 'johndoe@example.com', '$2a$10$mTfPnL3qKPY3zYQX5H.LVeKxGHkB5VQZPvEPYGDZlYxI/IQ/4V7y6', true),
('janedoe', 'janedoe@example.com', '$2a$10$mTfPnL3qKPY3zYQX5H.LVeKxGHkB5VQZPvEPYGDZlYxI/IQ/4V7y6', true),
('disableduser', 'disabled@example.com', '$2a$10$mTfPnL3qKPY3zYQX5H.LVeKxGHkB5VQZPvEPYGDZlYxI/IQ/4V7y6', false);