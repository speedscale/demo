-- Transactions Service Migration V1
-- Creates the transactions table in transactions_service schema

SET search_path TO transactions_service;

-- Create transaction types enum
CREATE TYPE transaction_type AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER');

-- Create transaction status enum
CREATE TYPE transaction_status AS ENUM ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- Create transactions table
CREATE TABLE transactions (
    id BIGSERIAL PRIMARY KEY,
    from_account_id BIGINT,
    to_account_id BIGINT,
    amount DECIMAL(15,2) NOT NULL,
    transaction_type transaction_type NOT NULL,
    transaction_status transaction_status DEFAULT 'PENDING',
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    CONSTRAINT positive_amount CHECK (amount > 0),
    CONSTRAINT valid_transfer CHECK (
        (transaction_type = 'TRANSFER' AND from_account_id IS NOT NULL AND to_account_id IS NOT NULL)
        OR (transaction_type = 'DEPOSIT' AND to_account_id IS NOT NULL AND from_account_id IS NULL)
        OR (transaction_type = 'WITHDRAWAL' AND from_account_id IS NOT NULL AND to_account_id IS NULL)
    ),
    CONSTRAINT no_self_transfer CHECK (from_account_id != to_account_id)
);

-- Create indexes
CREATE INDEX idx_transactions_from_account ON transactions(from_account_id);
CREATE INDEX idx_transactions_to_account ON transactions(to_account_id);
CREATE INDEX idx_transactions_type ON transactions(transaction_type);
CREATE INDEX idx_transactions_status ON transactions(transaction_status);
CREATE INDEX idx_transactions_created_at ON transactions(created_at);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_transactions_updated_at 
    BEFORE UPDATE ON transactions 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();