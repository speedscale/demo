-- Create schemas for each microservice
-- This script runs automatically when the PostgreSQL container starts

-- Create user_service schema
CREATE SCHEMA IF NOT EXISTS user_service;

-- Create accounts_service schema  
CREATE SCHEMA IF NOT EXISTS accounts_service;

-- Create transactions_service schema
CREATE SCHEMA IF NOT EXISTS transactions_service;

-- Create users for each service (with limited permissions)
CREATE USER user_service_user WITH PASSWORD 'user_service_pass';
CREATE USER accounts_service_user WITH PASSWORD 'accounts_service_pass';
CREATE USER transactions_service_user WITH PASSWORD 'transactions_service_pass';

-- Grant schema permissions
GRANT ALL PRIVILEGES ON SCHEMA user_service TO user_service_user;
GRANT ALL PRIVILEGES ON SCHEMA accounts_service TO accounts_service_user;
GRANT ALL PRIVILEGES ON SCHEMA transactions_service TO transactions_service_user;

-- Grant usage on public schema (for extensions, etc.)
GRANT USAGE ON SCHEMA public TO user_service_user;
GRANT USAGE ON SCHEMA public TO accounts_service_user;
GRANT USAGE ON SCHEMA public TO transactions_service_user;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA user_service GRANT ALL ON TABLES TO user_service_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA accounts_service GRANT ALL ON TABLES TO accounts_service_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA transactions_service GRANT ALL ON TABLES TO transactions_service_user;

-- Set default privileges for sequences
ALTER DEFAULT PRIVILEGES IN SCHEMA user_service GRANT ALL ON SEQUENCES TO user_service_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA accounts_service GRANT ALL ON SEQUENCES TO accounts_service_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA transactions_service GRANT ALL ON SEQUENCES TO transactions_service_user;

-- Print confirmation
\echo 'Database schemas and users created successfully'