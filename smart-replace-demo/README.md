# Smart Replace Demo API

This is a simple Node.js API server designed to demonstrate Speedscale's Smart Replace features, including advanced patterns like dual-mode identification.

## Features

- JWT-based authentication
- User profiles with unique IDs
- Order management with dynamic order IDs
- **Cart management with dual-mode identification** (session-based and explicit ID access)
- **Separate warehouse service** (port 8081) for true outbound HTTP calls
- Perfect for demonstrating smart replace transforms and auto-detection

## Architecture

The demo uses **two separate services** to demonstrate real outbound traffic:

```
┌─────────────┐                    ┌────────────────────┐
│   Client    │───── HTTP ────────►│   Cart Service     │
│  (curl/test)│                    │   (port 8080)      │
└─────────────┘                    └────────────────────┘
                                            │
                                            │ HTTP (outbound)
                                            │ goes through proxymock
                                            ▼
                                   ┌────────────────────┐
                                   │ Warehouse Service  │
                                   │   (port 8081)      │
                                   └────────────────────┘
```

**Why This Matters**:
- Cart → Warehouse calls are **true outbound HTTP** requests
- Proxymock can record these as outbound RRPairs
- Mock server can intercept and match (or fail to match) these calls
- Demonstrates real-world service-to-service communication patterns

**Running the Services**:
```bash
# Terminal 1: Start warehouse service
node warehouse-service.js

# Terminal 2: Start cart service
node server.js

# Terminal 3: Run tests
./test-cart-session-scenario.sh
```

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
- `GET /users/me` - Get the current user's profile (requires JWT)
- `GET /users/:userId` - Get specific user profile by ID (requires JWT)

### Orders
- `POST /orders` - Create new order, returns unique order ID
- `GET /orders?orderId=<id>` - Get order details

### Cart (Dual-Mode Identification)

**Session-Based (Implicit)** - Uses JWT userId to resolve cartId server-side:
- `POST /cart/items` - Add item to cart (creates cart on first access)
- `GET /cart` - Get my cart (resolves userId → cartId, calls warehouse service)
- `PUT /cart/address` - Set delivery address (triggers warehouse assignment)

**Explicit ID-Based** - Direct cart access by ID in URL:
- `GET /cart/:cartId` - Get cart by explicit ID (calls warehouse service)

### Internal Services (Mock Downstream)
- `POST /internal/warehouse/assign` - Mock warehouse assignment service (receives cartId)

## Demo Scenarios

### Existing Scenarios

#### 1. Smart Replace CSV - Bulk User ID Replacement
Run: `./test-csv-scenario.sh`
1. Tests multiple user logins with ID replacements
2. Demonstrates CSV-based ID mapping

#### 2. Smart Replace - Order ID Tracking
Run: `./test-recorded-scenario.sh`
1. Creates orders with dynamic UUID-based IDs
2. Tests order creation and retrieval

### Cart Scenarios (Dual-Mode Identification Pattern)

These scenarios demonstrate the **dual-mode identification pattern** common in e-commerce cart services. They intentionally create signature mismatches during replay to test Smart Replace transform auto-detection.

#### 3. Session-Based Cart Flow
Run: `./test-cart-session-scenario.sh`

**Pattern**: Implicit cart resolution (userId → cartId)
1. Login as user (gets JWT with userId)
2. Add items to cart (cartId generated on first access)
3. Retrieve cart (resolves userId → cartId server-side)
4. Set delivery address (triggers downstream warehouse service)
5. Cart operations call warehouse service with resolved cartId

**Expected Replay Failures Without Transforms**:
- ❌ Different cartId generated on replay
- ❌ Warehouse service request signature mismatch (cartId in body)
- ❌ Warehouse response signature mismatch (cartId + timestamp)

**Required Transforms**:
- `smart_replace`: Track cartId value across recording → replay
- `scrub`: Normalize timestamps (createdAt, updatedAt, assignedAt)
- `json_path`: Replace cartId in warehouse request/response bodies

#### 4. Explicit Cart Access
Run: `./test-cart-explicit-scenario.sh`

**Pattern**: Direct cart access by ID in URL path
1. Create carts for multiple users (implicit)
2. Access carts via explicit URL: `/cart/{cartId}`
3. Different users access same cart by ID
4. Demonstrates cross-user cart access via explicit ID

**Expected Replay Failures Without Transforms**:
- ❌ URL path parameter mismatch: `/cart/cart-abc123` vs `/cart/cart-xyz789`
- ❌ Warehouse request body signature mismatch (different cartId)
- ❌ Response body cartId mismatch

**Required Transforms**:
- `smart_replace`: Track multiple cartIds independently
- URL path rewriting: Replace `{cartId}` in `/cart/{cartId}` endpoints
- `json_path`: Replace cartId in warehouse request/response bodies

#### 5. Cross-Session Cart Access
Run: `./test-cart-cross-session-scenario.sh`

**Pattern**: Mixed implicit and explicit access to same cart
1. Session A: Create cart via implicit access (userId → cartId)
2. Session B: Access same cart via explicit ID `/cart/{cartId}`
3. Alternate between implicit and explicit access
4. Multiple users creating and accessing multiple carts
5. Demonstrates complex ID tracking across patterns

**Expected Replay Failures Without Transforms**:
- ❌ Multiple cartId mismatches (Sarah's cart, Alex's cart)
- ❌ Session → cartId mapping differs between recording and replay
- ❌ Warehouse service signatures mismatch across all carts
- ❌ Timestamps vary across multiple requests

**Required Transforms**:
- `smart_replace`: Track multiple cartIds simultaneously
- URL path rewriting: Handle different cartIds in same URL pattern
- `json_path`: Replace cartId in all warehouse request/response bodies
- `scrub`: Normalize all timestamps across all requests

## Understanding the Dual-Mode Pattern

The cart endpoints demonstrate a **dual-mode identification strategy** common in production systems:

### Session-Based (Implicit Resolution)
```
Client: "Here's my JWT (contains userId)"
Server: "Let me look up your cartId... here's your cart"
```
- Client doesn't send cartId
- Server maintains userId → cartId mapping (in-memory Map)
- Reduces client complexity and payload size

### Explicit ID-Based (Direct Access)
```
Client: "Give me cart cart-abc-123-xyz"
Server: "Here's that specific cart"
```
- cartId embedded in URL path
- No session state lookup required
- Enables cart sharing, cross-session access

### Why This Matters for Smart Replace

1. **Multiple ID Locations**: CartId appears in:
   - Response bodies (cart creation)
   - URL path parameters (explicit access)
   - Request bodies (warehouse service calls)
   - Response bodies (warehouse service responses)

2. **Cross-Service Propagation**: Cart service passes cartId to warehouse service, requiring Smart Replace to track IDs across service boundaries

3. **Complex State Management**: Session → ID mapping state differs between recording and replay, causing signature mismatches

4. **Auto-Detection Target**: These patterns test Smart Replace's ability to automatically detect and suggest appropriate transforms

## Automated Validation

### Proxymock Validation Script

Run: `./validate-dual-mode-pattern.sh`

Automated end-to-end validation that:
1. ✅ Starts the server if not running
2. 📹 Records traffic through proxymock
3. 🧪 Runs test scenario against the proxy
4. 🔄 Replays recorded traffic
5. 🔍 Analyzes signature mismatches
6. 📊 Generates detailed validation report

**Output**:
- `proxymock/recorded-<timestamp>/` - Captured RRPair files
- `proxymock/replayed-<timestamp>/` - Replayed RRPair files
- `.ai/validation-report-<timestamp>.md` - Detailed analysis

**What It Validates**:
- ✅ Timestamp mismatches (updatedAt, estimatedDelivery)
- ✅ Random value differences (warehouseId, distance)
- ✅ State accumulation issues
- ✅ Transform recommendations for each mismatch type

**Example Output**:
```
Mismatch Analysis:
─────────────────────────────────────────────────
  ✗ Timestamps differ
    Recorded:  2025-10-28T19:06:25.133Z
    Replayed:  2025-10-28T19:08:40.885Z
  ✗ Warehouse IDs differ
    Recorded:  wh-2
    Replayed:  wh-4
  ℹ Cart ID: cart-136126f7-b466-4b1d-bc69-e000436933ce

✅ SUCCESS: Signature mismatches detected as expected
```

This script provides repeatable validation that the dual-mode pattern creates the expected signature mismatches for Smart Replace testing.

### Mock Matching Failure Demonstration

Run: `./demonstrate-mock-matching-failure.sh`

**Actually uses `proxymock mock`** to demonstrate matching failures with real outbound HTTP calls.

**Architecture**:
- **Cart Service** (port 8080): Main API server
- **Warehouse Service** (port 8081): Separate downstream service
- **Proxymock Mock** (port 4140): Intercepts outbound warehouse calls

**What It Does**:
1. 🎬 **Session A**: Records traffic (cart-A + warehouse responses)
2. 🔄 Restarts both services (clears state)
3. 🎭 Starts `proxymock mock` with Session A mocks
4. 🔁 **Session B**: Runs test (creates cart-B, tries to use mocks)
5. 🔍 Shows **NO_MATCH** or **PASSTHROUGH** for warehouse calls

**Key Demonstration**:
```
Session A (Recorded):  cart-136126f7-b466-4b1d-bc69-e000436933ce
Session B (Mocked):    cart-a7f39d42-8e1c-4c9f-b2a5-d8f7e3c91a0d

✗ CART ID MISMATCH

Mock Server Behavior:
  • Loaded mocks contain cart-A in warehouse request bodies
  • Session B makes warehouse request with cart-B
  • Signature mismatch → NO_MATCH
  • Mock server returns NO_MATCH or forwards to real service (PASSTHROUGH)
```

**Why This Is Critical**:
- Uses **actual outbound HTTP calls** (cart → warehouse service)
- Proxymock records these calls as outbound RRPairs
- Mock server tries to match warehouse requests by signature
- Request body signature includes `{"cartId": "cart-xyz..."}`
- Different cartId = different signature = NO_MATCH

**Output**:
```
Mock Server Results:
  NO_MATCH files: 2
  PASSTHROUGH files: 0

✗ MOCK MATCHING FAILED

Required Transform:
  • smart_replace: Track cartId value (cart-A → cart-B)
  • json_path: Replace cartId in warehouse request bodies
```

This proves that **transforms are required** for mock matching to work with dynamic IDs.

## Demo Users

| Email | Username | Password |
| --- | --- | --- |
| sarah.martinez@example.com | sarah-martinez | password123 |
| david.kim@example.com | dkim | password123 |
| emma.thompson@example.com | emma | password123 |
| alex.rodriguez@example.com | arod | password123 |
| jessica.brown@example.com | jess | password123 |
