-- Create transactions table
CREATE TABLE transactions_service.transactions (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    from_account_id BIGINT,
    to_account_id BIGINT,
    amount DECIMAL(19,2) NOT NULL,
    type VARCHAR(20) NOT NULL,
    description VARCHAR(500),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_transactions_user_id ON transactions_service.transactions(user_id);
CREATE INDEX idx_transactions_from_account_id ON transactions_service.transactions(from_account_id);
CREATE INDEX idx_transactions_to_account_id ON transactions_service.transactions(to_account_id);
CREATE INDEX idx_transactions_created_at ON transactions_service.transactions(created_at DESC);
CREATE INDEX idx_transactions_status ON transactions_service.transactions(status);
CREATE INDEX idx_transactions_type ON transactions_service.transactions(type);

-- Add constraints
ALTER TABLE transactions_service.transactions 
ADD CONSTRAINT chk_amount_positive 
CHECK (amount > 0);

ALTER TABLE transactions_service.transactions 
ADD CONSTRAINT chk_transaction_type 
CHECK (type IN ('DEPOSIT', 'WITHDRAWAL', 'TRANSFER'));

ALTER TABLE transactions_service.transactions 
ADD CONSTRAINT chk_transaction_status 
CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED'));

-- Add constraint for transfer transactions (must have both from and to account)
ALTER TABLE transactions_service.transactions 
ADD CONSTRAINT chk_transfer_accounts 
CHECK (
    (type = 'TRANSFER' AND from_account_id IS NOT NULL AND to_account_id IS NOT NULL) OR
    (type = 'DEPOSIT' AND from_account_id IS NULL AND to_account_id IS NOT NULL) OR
    (type = 'WITHDRAWAL' AND from_account_id IS NOT NULL AND to_account_id IS NULL)
);