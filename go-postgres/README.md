# Go PostgreSQL Demo App

A simple Go web application that provides REST API endpoints for user management with PostgreSQL database.

## Prerequisites

- Go 1.19 or later
- PostgreSQL server running on localhost:5432
- Database named `userdb` with credentials `postgres:postgres`

## Setup

1. Create PostgreSQL and start database:
Starting Postgres on MacOS can be done with:
```bash
brew services start postgresql@15
```

And you can create the databse in psql with:

```sql
CREATE DATABASE userdb;
```

2. Install dependencies:
```bash
go mod tidy
```

3. Change Postgres username in go.main.go
```go
connStr := "host=localhost port=5432 user=postgres dbname=postgres sslmode=disable"
```
Modiy user= to match your username

3. Run the application:
```bash
go run main.go
```

The server will start on port 8080 and automatically:
- Create the users table
- Populate it with 5 demo users

## API Endpoints

- `GET /users` - List all users
- `POST /users` - Create a new user
- `PUT /users/{id}` - Update a user by ID
- `DELETE /users/{id}` - Delete a user by ID

## User Schema

Each user has the following fields:
- id (auto-generated)
- first_name
- last_name
- email (unique)
- username (unique)
- age
- phone
- address
- city
- country
- job_title
- department
- salary
- hire_date
- is_active

## Example Usage

```bash
# List all users
curl http://localhost:8080/users

# Create a new user
curl -X POST http://localhost:8080/users \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Test","last_name":"User","email":"test@example.com","username":"testuser"}'

# Update a user
curl -X PUT http://localhost:8080/users/1 \
  -H "Content-Type: application/json" \
  -d '{"first_name":"Updated","last_name":"User","email":"updated@example.com","username":"updateduser"}'

# Delete a user
curl -X DELETE http://localhost:8080/users/1
```