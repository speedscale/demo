#!/usr/bin/env node

/**
 * Kubernetes Client - Continuous Cart Service Tester
 *
 * Makes requests to cart service in a loop to trigger warehouse calls.
 * Deployed as a pod in the k8s cluster.
 */

const http = require("http");
const { DEMO_USERS, DEMO_PASSWORD } = require("./demo-users");

const CART_SERVICE_HOST = process.env.CART_SERVICE_HOST || "localhost";
const CART_SERVICE_PORT = parseInt(process.env.CART_SERVICE_PORT || "8080");
const REQUEST_INTERVAL_MS = parseInt(process.env.REQUEST_INTERVAL_MS || "3000");

// Demo users - pick one at random for this client session
const USER_EMAIL =
  DEMO_USERS[Math.floor(Math.random() * DEMO_USERS.length)].email;
const USER_PASSWORD = DEMO_PASSWORD;

console.log("Cart Service Client Starting...");
console.log(`Target: http://${CART_SERVICE_HOST}:${CART_SERVICE_PORT}`);
console.log(`User: ${USER_EMAIL}`);
console.log(
  `Interval: ${REQUEST_INTERVAL_MS}ms (${REQUEST_INTERVAL_MS / 1000}s)`,
);
console.log("");

let requestCount = 0;

/**
 * Make HTTP request
 */
function makeRequest(method, path, headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: CART_SERVICE_HOST,
      port: CART_SERVICE_PORT,
      path: path,
      method: method,
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    };

    if (body) {
      const bodyStr = JSON.stringify(body);
      options.headers["Content-Length"] = Buffer.byteLength(bodyStr);
    }

    const req = http.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve({ status: res.statusCode, body: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, body: data });
        }
      });
    });

    req.on("error", (err) => {
      reject(err);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }

    req.end();
  });
}

/**
 * Run one complete cart flow
 */
async function runCartFlow() {
  requestCount++;
  const flowId = requestCount;

  console.log(`[Flow ${flowId}] Starting cart flow...`);

  try {
    // 1. Login
    const loginRes = await makeRequest(
      "POST",
      "/auth/login",
      {},
      {
        email: USER_EMAIL,
        password: USER_PASSWORD,
      },
    );

    if (loginRes.status !== 200) {
      console.error(`[Flow ${flowId}] ❌ Login failed: ${loginRes.status}`);
      return;
    }

    const token = loginRes.body.token;
    console.log(`[Flow ${flowId}] ✓ Logged in`);

    // 2. Add item to cart (creates cart)
    const addItemRes = await makeRequest(
      "POST",
      "/cart/items",
      { Authorization: `Bearer ${token}` },
      {
        itemId: `item-${Date.now()}`,
        name: "Test Product",
        quantity: 1,
        price: 99.99,
      },
    );

    if (addItemRes.status !== 200 && addItemRes.status !== 201) {
      console.error(
        `[Flow ${flowId}] ❌ Add item failed: ${addItemRes.status}`,
      );
      return;
    }

    const cartId = addItemRes.body.cartId;
    console.log(`[Flow ${flowId}] ✓ Added item to cart: ${cartId}`);

    // 3. Set address (triggers warehouse call)
    const setAddressRes = await makeRequest(
      "PUT",
      "/cart/address",
      { Authorization: `Bearer ${token}` },
      {
        street: "123 Test St",
        city: "TestCity",
        state: "TC",
        zip: "12345",
      },
    );

    if (setAddressRes.status !== 200) {
      console.error(
        `[Flow ${flowId}] ❌ Set address failed: ${setAddressRes.status}`,
      );
      return;
    }

    console.log(`[Flow ${flowId}] ✓ Set address (warehouse called)`);

    // 4. Get cart (triggers warehouse call)
    const getCartRes = await makeRequest("GET", "/cart", {
      Authorization: `Bearer ${token}`,
    });

    if (getCartRes.status !== 200) {
      console.error(
        `[Flow ${flowId}] ❌ Get cart failed: ${getCartRes.status}`,
      );
      return;
    }

    const warehouseCount = getCartRes.body.warehouseAssignments?.length || 0;
    console.log(
      `[Flow ${flowId}] ✓ Retrieved cart (${warehouseCount} warehouse assignments)`,
    );
    console.log(`[Flow ${flowId}] ✅ Flow completed successfully\n`);
  } catch (err) {
    console.error(`[Flow ${flowId}] ❌ Error: ${err.message}\n`);
  }
}

/**
 * Main loop
 */
async function main() {
  // Run first request immediately
  await runCartFlow();

  // Then continue at interval
  setInterval(async () => {
    await runCartFlow();
  }, REQUEST_INTERVAL_MS);
}

// Handle shutdown gracefully
process.on("SIGTERM", () => {
  console.log("\nReceived SIGTERM, shutting down gracefully...");
  console.log(`Total flows executed: ${requestCount}`);
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("\nReceived SIGINT, shutting down gracefully...");
  console.log(`Total flows executed: ${requestCount}`);
  process.exit(0);
});

// Start
main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
