-- Insert test users with BCrypt hashed passwords
-- Default password for all test users is: password123
-- Password for demo user is: password

INSERT INTO users (username, email, password_hash, enabled) VALUES
('demo', 'demo@example.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', true),
('admin', 'admin@example.com', '$2a$10$mTfPnL3qKPY3zYQX5H.LVeKxGHkB5VQZPvEPYGDZlYxI/IQ/4V7y6', true),
('testuser', 'testuser@example.com', '$2a$10$mTfPnL3qKPY3zYQX5H.LVeKxGHkB5VQZPvEPYGDZlYxI/IQ/4V7y6', true),
('johndoe', 'johndoe@example.com', '$2a$10$mTfPnL3qKPY3zYQX5H.LVeKxGHkB5VQZPvEPYGDZlYxI/IQ/4V7y6', true),
('janedoe', 'janedoe@example.com', '$2a$10$mTfPnL3qKPY3zYQX5H.LVeKxGHkB5VQZPvEPYGDZlYxI/IQ/4V7y6', true),
('disableduser', 'disabled@example.com', '$2a$10$mTfPnL3qKPY3zYQX5H.LVeKxGHkB5VQZPvEPYGDZlYxI/IQ/4V7y6', false);