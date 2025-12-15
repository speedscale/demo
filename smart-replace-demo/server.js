const express = require("express");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");
const http = require("http");
const https = require("https");
const { URL } = require("url");
const { DEMO_USERS, DEMO_PASSWORD } = require("./demo-users");

const app = express();
app.use(express.json());

// Configure HTTP agent with proxy if set
const proxyUrl =
  process.env.HTTP_PROXY ||
  process.env.http_proxy ||
  process.env.HTTPS_PROXY ||
  process.env.https_proxy;
let httpAgent = null;
let httpsAgent = null;

if (proxyUrl) {
  console.log(
    `[${new Date().toISOString()}] Configuring HTTP proxy: ${proxyUrl}`,
  );
  const HttpProxyAgent = require("http-proxy-agent");
  const HttpsProxyAgent = require("https-proxy-agent");
  httpAgent = new HttpProxyAgent.HttpProxyAgent(proxyUrl);
  httpsAgent = new HttpsProxyAgent.HttpsProxyAgent(proxyUrl);
} else {
  console.log(`[${new Date().toISOString()}] No proxy configured`);
}

// In-memory database
const users = new Map();
const orders = new Map();

// Cart data structures
const userCartMap = new Map(); // Maps userId → cartId for session-based cart resolution
const carts = new Map(); // Maps cartId → cart object

// JWT secret
const JWT_SECRET = "demo-secret-key";

// Initialize demo data
function initializeDemoData() {
  DEMO_USERS.forEach((user) => {
    users.set(user.id, { ...user, password: DEMO_PASSWORD });
  });
}

// Initialize data on startup
initializeDemoData();

// Auth endpoints
app.post("/auth/login", (req, res) => {
  console.log(
    `[${new Date().toISOString()}] POST /auth/login - Email: ${req.body.email}`,
  );
  const { email, password } = req.body;

  // Find user by email
  let foundUser = null;
  for (const [id, user] of users) {
    if (user.email === email && user.password === password) {
      foundUser = user;
      break;
    }
  }

  if (!foundUser) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  // Generate JWT with user ID
  const token = jwt.sign(
    { userId: foundUser.id, email: foundUser.email },
    JWT_SECRET,
    { expiresIn: "7d" },
  );

  res.json({
    token,
    userId: foundUser.id,
    message: "Login successful",
  });
});

// Middleware to verify JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: "Invalid token" });
    }
    req.user = user;
    next();
  });
}

// User endpoints
app.get("/users/me", authenticateToken, (req, res) => {
  console.log(
    `[${new Date().toISOString()}] GET /users/me - Requested by: ${req.user.email}`,
  );
  const user = users.get(req.user.userId);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  // Return user without password
  const { password, ...userInfo } = user;
  res.json(userInfo);
});

app.get("/users/:userId", authenticateToken, (req, res) => {
  console.log(
    `[${new Date().toISOString()}] GET /users/${req.params.userId} - Requested by: ${req.user.email}`,
  );
  const { userId } = req.params;
  const user = users.get(userId);

  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }

  // Return user without password
  const { password, ...userInfo } = user;
  res.json(userInfo);
});

// Order endpoints
app.post("/orders", authenticateToken, (req, res) => {
  console.log(
    `[${new Date().toISOString()}] POST /orders - User: ${req.user.email}, Total: $${req.body.totalAmount}`,
  );
  const { items, totalAmount } = req.body;
  const orderId = `order-${uuidv4()}`;

  const order = {
    id: orderId,
    userId: req.user.userId,
    items,
    totalAmount,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  orders.set(orderId, order);

  res.status(201).json({
    orderId: order.id,
    message: "Order created successfully",
    order,
  });
});

app.get("/orders", authenticateToken, (req, res) => {
  console.log(
    `[${new Date().toISOString()}] GET /orders?orderId=${req.query.orderId} - Requested by: ${req.user.email}`,
  );
  const { orderId } = req.query;
  const order = orders.get(orderId);

  if (!order) {
    return res.status(404).json({ error: "Order not found" });
  }

  // Verify order belongs to user
  if (order.userId !== req.user.userId) {
    return res.status(403).json({ error: "Access denied" });
  }

  res.json(order);
});

// Data endpoints - demonstrates smart replace with path parameters
app.get("/data/:id", authenticateToken, (req, res) => {
  console.log(
    `[${new Date().toISOString()}] GET /data/${req.params.id} - Requested by: ${req.user.email}`,
  );
  const { id } = req.params;

  // Generate dynamic data based on the ID
  const data = {
    id: id,
    requestedBy: req.user.userId,
    timestamp: new Date().toISOString(),
    // Simulate data retrieval with ID-dependent values
    value: parseInt(id.replace(/\D/g, "") || "0", 10) * 42,
    metadata: {
      generatedAt: new Date().toISOString(),
      source: "smart-replace-demo",
      idHash: Buffer.from(id).toString("base64"),
    },
  };

  res.json(data);
});

app.post("/data/:id", authenticateToken, (req, res) => {
  console.log(
    `[${new Date().toISOString()}] POST /data/${req.params.id} - Requested by: ${req.user.email}, Body:`,
    req.body,
  );
  const { id } = req.params;
  const { name, value, description } = req.body;

  // Create response with posted data
  const data = {
    id: id,
    name: name || `Data ${id}`,
    value: value || 0,
    description: description || "",
    createdBy: req.user.userId,
    createdAt: new Date().toISOString(),
    metadata: {
      source: "smart-replace-demo",
      idHash: Buffer.from(id).toString("base64"),
      bodyHash: Buffer.from(JSON.stringify(req.body))
        .toString("base64")
        .substring(0, 16),
    },
  };

  res.status(201).json({
    message: "Data created successfully",
    data,
  });
});

// Helper function: Get or create cart for a user (session-based)
function getOrCreateCart(userId) {
  let cartId = userCartMap.get(userId);

  if (!cartId) {
    // Create new cart
    cartId = `cart-${uuidv4()}`;
    userCartMap.set(userId, cartId);

    const cart = {
      id: cartId,
      userId: userId,
      items: [],
      address: null,
      warehouseAssignments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    carts.set(cartId, cart);
    console.log(
      `[${new Date().toISOString()}] Created new cart ${cartId} for user ${userId}`,
    );
  }

  return carts.get(cartId);
}

// Helper function: Call warehouse service using native http with proxy support
function callWarehouseService(cartId, userId, items, address) {
  console.log(
    `[${new Date().toISOString()}] ========================================`,
  );
  console.log(`[${new Date().toISOString()}] WAREHOUSE SERVICE CALL INITIATED`);
  console.log(`[${new Date().toISOString()}] CartID: ${cartId}`);
  console.log(`[${new Date().toISOString()}] UserID: ${userId}`);
  console.log(`[${new Date().toISOString()}] Items count: ${items.length}`);
  console.log(`[${new Date().toISOString()}] Items: ${JSON.stringify(items)}`);
  console.log(
    `[${new Date().toISOString()}] Address: ${JSON.stringify(address)}`,
  );

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      cartId: cartId,
      userId: userId,
      items: items,
      address: address,
    });

    const options = {
      hostname: process.env.WAREHOUSE_SERVICE_HOST || "localhost",
      port: parseInt(process.env.WAREHOUSE_SERVICE_PORT || "8081"),
      path: "/warehouse/assign",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(postData),
      },
    };

    // Add agent if proxy is configured
    if (httpAgent) {
      options.agent = httpAgent;
      console.log(
        `[${new Date().toISOString()}] Using HTTP proxy agent for warehouse call`,
      );
    }

    console.log(`[${new Date().toISOString()}] OUTBOUND REQUEST START:`, {
      method: options.method,
      url: `http://${options.hostname}:${options.port}${options.path}`,
      hasAgent: !!options.agent,
      bodySize: Buffer.byteLength(postData),
    });

    const req = http.request(options, (res) => {
      let data = "";

      res.on("data", (chunk) => {
        data += chunk;
      });

      res.on("end", () => {
        console.log(
          `[${new Date().toISOString()}] OUTBOUND RESPONSE RECEIVED:`,
          {
            status: res.statusCode,
            url: `http://${options.hostname}:${options.port}${options.path}`,
            bodyLength: data.length,
          },
        );

        try {
          const parsed = JSON.parse(data);
          console.log(
            `[${new Date().toISOString()}] WAREHOUSE RESPONSE DATA: ${JSON.stringify(parsed)}`,
          );
          console.log(
            `[${new Date().toISOString()}] WAREHOUSE SERVICE CALL COMPLETED`,
          );
          console.log(
            `[${new Date().toISOString()}] ========================================`,
          );
          resolve(parsed);
        } catch (error) {
          console.error(
            `[${new Date().toISOString()}] Failed to parse warehouse response:`,
            error.message,
          );
          console.log(
            `[${new Date().toISOString()}] WAREHOUSE SERVICE CALL FAILED (parse error)`,
          );
          console.log(
            `[${new Date().toISOString()}] ========================================`,
          );
          resolve(null);
        }
      });
    });

    req.on("error", (error) => {
      console.error(`[${new Date().toISOString()}] OUTBOUND REQUEST ERROR:`, {
        message: error.message,
        code: error.code,
        url: `http://${options.hostname}:${options.port}${options.path}`,
      });
      console.log(
        `[${new Date().toISOString()}] WAREHOUSE SERVICE CALL FAILED (network error)`,
      );
      console.log(
        `[${new Date().toISOString()}] ========================================`,
      );
      resolve(null);
    });

    req.write(postData);
    req.end();
  });
}

// POST /cart/items - Add item to cart (session-based implicit)
app.post("/cart/items", authenticateToken, (req, res) => {
  console.log(
    `[${new Date().toISOString()}] POST /cart/items - User: ${req.user.email}`,
  );
  const { itemId, name, quantity, price } = req.body;

  const cart = getOrCreateCart(req.user.userId);

  // Add item to cart
  cart.items.push({ itemId, name, quantity, price });
  cart.updatedAt = new Date().toISOString();

  // Calculate total
  const total = cart.items.reduce(
    (sum, item) => sum + item.quantity * item.price,
    0,
  );

  res.json({
    cartId: cart.id,
    items: cart.items,
    total: total,
    message: "Item added to cart",
  });
});

// GET /cart - Get cart (session-based implicit)
app.get("/cart", authenticateToken, async (req, res) => {
  console.log(
    `[${new Date().toISOString()}] GET /cart - User: ${req.user.email}`,
  );

  const cart = getOrCreateCart(req.user.userId);

  // Call downstream warehouse service with resolved cartId (demonstrates outbound with full ID)
  if (cart.items.length > 0 && cart.address) {
    const warehouseData = await callWarehouseService(
      cart.id,
      cart.userId,
      cart.items.slice(0, 2),
      cart.address,
    );

    if (warehouseData) {
      cart.warehouseAssignments = warehouseData.assignments;
      console.log(
        `[${new Date().toISOString()}] Warehouse assignments received for cart ${cart.id}`,
      );
    }
  }

  res.json(cart);
});

// PUT /cart/address - Set delivery address (session-based implicit, triggers warehouse call)
app.put("/cart/address", authenticateToken, async (req, res) => {
  console.log(
    `[${new Date().toISOString()}] PUT /cart/address - User: ${req.user.email}`,
  );
  const { street, city, state, zip } = req.body;

  const cart = getOrCreateCart(req.user.userId);
  cart.address = { street, city, state, zip };
  cart.updatedAt = new Date().toISOString();

  // Call downstream warehouse service with resolved cartId
  if (cart.items.length > 0) {
    const warehouseData = await callWarehouseService(
      cart.id,
      cart.userId,
      cart.items.slice(0, 2),
      cart.address,
    );

    if (warehouseData) {
      cart.warehouseAssignments = warehouseData.assignments;
      console.log(
        `[${new Date().toISOString()}] Warehouse assignments updated for cart ${cart.id}`,
      );
    }
  }

  res.json({
    cartId: cart.id,
    address: cart.address,
    warehouseAssignments: cart.warehouseAssignments,
    message: "Address updated",
  });
});

// GET /cart/:cartId - Get cart by explicit cartId
app.get("/cart/:cartId", authenticateToken, async (req, res) => {
  console.log(
    `[${new Date().toISOString()}] GET /cart/${req.params.cartId} - User: ${req.user.email}`,
  );
  const { cartId } = req.params;
  const cart = carts.get(cartId);

  if (!cart) {
    return res.status(404).json({ error: "Cart not found" });
  }

  // Call downstream warehouse service with explicit cartId
  if (cart.items.length > 0 && cart.address) {
    const warehouseData = await callWarehouseService(
      cart.id,
      cart.userId,
      cart.items.slice(0, 2),
      cart.address,
    );

    if (warehouseData) {
      cart.warehouseAssignments = warehouseData.assignments;
      console.log(
        `[${new Date().toISOString()}] Warehouse assignments received for explicit cart ${cart.id}`,
      );
    }
  }

  res.json(cart);
});

// Health check
app.get("/health", (req, res) => {
  console.log(`[${new Date().toISOString()}] GET /health`);
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Smart Replace Demo Server running on port ${PORT}`);
  console.log("\nAvailable endpoints:");
  console.log("  POST /auth/login        - Login with email/password");
  console.log("  GET  /users/me          - Get own profile (requires auth)");
  console.log("  GET  /users/:userId     - Get user profile (requires auth)");
  console.log("  POST /orders            - Create new order (requires auth)");
  console.log("  GET  /orders?orderId=ID - Get order details (requires auth)");
  console.log(
    "  POST /cart/items        - Add item to cart (session-based, requires auth)",
  );
  console.log(
    "  GET  /cart              - Get my cart (session-based, requires auth)",
  );
  console.log(
    "  PUT  /cart/address      - Set delivery address (session-based, requires auth)",
  );
  console.log(
    "  GET  /cart/:cartId      - Get cart by ID (explicit, requires auth)",
  );
  console.log("  GET  /data/:id          - Get data by ID (requires auth)");
  console.log(
    "  POST /data/:id          - Create/update data by ID (requires auth)",
  );
  console.log("  GET  /health            - Health check");
  console.log("\nDownstream services:");
  console.log("  Warehouse service: http://localhost:8081/warehouse/assign");
  console.log("  (Start with: node warehouse-service.js)");
  console.log("\nDemo users:");
  DEMO_USERS.forEach((user) => {
    console.log(`  ${user.email} / ${DEMO_PASSWORD} (ID: ${user.id})`);
  });
});
