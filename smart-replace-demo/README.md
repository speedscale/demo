# Smart Replace Demo API

This is a simple Node.js API server designed to demonstrate Speedscale's Smart Replace features.

## Features

- JWT-based authentication
- User profiles with unique IDs
- Order management with dynamic order IDs
- Perfect for demonstrating all 3 smart replace transforms

## Installation

```bash
npm install
```

## Running the Server

```bash
npm start
```

The server will run on port 8080 by default.

## API Endpoints

### Authentication
- `POST /auth/login` - Login with email/password, returns JWT token

### Users
- `GET /users/:userId` - Get user profile (requires JWT)

### Orders  
- `POST /orders` - Create new order, returns unique order ID
- `GET /orders/:orderId` - Get order details

## Demo Scenarios

### 1. Smart Replace - JWT Token Replacement
1. Login to get JWT token
2. Use token for subsequent requests
3. Smart replace will handle token changes between recording/replay

### 2. Smart Replace CSV - Bulk User ID Replacement
1. Export user IDs from recorded traffic
2. Create CSV mapping old IDs → new test IDs
3. Smart replace CSV will handle all replacements

### 3. Smart Replace Recorded - Dynamic Order IDs
1. Create order (returns dynamic order ID)
2. Get order details using that ID
3. Smart replace recorded will sync the IDs during replay

## Demo Users

- sarah.martinez@example.com / password123 (ID: sarah-martinez)
- david.kim@example.com / password123 (ID: david-kim)
- emma.thompson@example.com / password123 (ID: emma-thompson)
- alex.rodriguez@example.com / password123 (ID: alex-rodriguez)
- jessica.brown@example.com / password123 (ID: jessica-brown)