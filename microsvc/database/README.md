# Database Setup

This directory contains the database configuration for the banking application.

## Structure

- `init/` - Database initialization scripts that run when PostgreSQL starts
- `migrations/` - Service-specific migration scripts
- `database.properties` - Database connection configuration

## Schemas

The application uses three schemas in a single PostgreSQL database:

- `user_service` - User authentication and profile data
- `accounts_service` - Bank account information and balances
- `transactions_service` - Transaction history and processing

## Quick Start

1. Start the database:
   ```bash
   docker-compose up -d postgres
   ```

2. Connect to the database:
   ```bash
   psql -h localhost -U postgres -d banking_app
   ```

3. Verify schemas:
   ```sql
   \dn
   ```

## Migration Scripts

Each service has its own migration directory with Flyway-compatible SQL files:

- `V1__Create_users_table.sql` - Creates users table with authentication data
- `V1__Create_accounts_table.sql` - Creates accounts table with balance tracking
- `V1__Create_transactions_table.sql` - Creates transactions table with full audit trail

## Connection Details

- **Host**: localhost
- **Port**: 5432
- **Database**: banking_app
- **Admin User**: postgres
- **Admin Password**: password

Each service has its own database user with schema-specific permissions for security.