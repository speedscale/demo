-- Create accounts table
CREATE TABLE accounts_service.accounts (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    account_number VARCHAR(20) NOT NULL UNIQUE,
    balance DECIMAL(19,2) NOT NULL DEFAULT 0.00,
    account_type VARCHAR(20) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX idx_accounts_user_id ON accounts_service.accounts(user_id);
CREATE INDEX idx_accounts_account_number ON accounts_service.accounts(account_number);
CREATE INDEX idx_accounts_user_id_account_number ON accounts_service.accounts(user_id, account_number);

-- Add constraint to ensure balance cannot be negative (for basic accounts)
ALTER TABLE accounts_service.accounts 
ADD CONSTRAINT chk_balance_non_negative 
CHECK (balance >= 0);

-- Add constraint for account_type
ALTER TABLE accounts_service.accounts 
ADD CONSTRAINT chk_account_type 
CHECK (account_type IN ('CHECKING', 'SAVINGS', 'CREDIT'));