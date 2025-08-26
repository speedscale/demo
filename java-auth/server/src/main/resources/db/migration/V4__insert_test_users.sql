-- Insert test users with plain passwords
-- Default password for all test users is: password123
-- Password for demo user is: password

INSERT INTO users (username, email, password_hash, enabled) VALUES
('demo', 'demo@example.com', 'password', true),
('admin', 'admin@example.com', 'password123', true),
('testuser', 'testuser@example.com', 'password123', true),
('johndoe', 'johndoe@example.com', 'password123', true),
('janedoe', 'janedoe@example.com', 'password123', true),
('disableduser', 'disabled@example.com', 'password123', false);