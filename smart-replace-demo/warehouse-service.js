const express = require("express");

const app = express();
app.use(express.json());

// Mock downstream warehouse service
// This simulates an external dependency that the cart service calls
app.post("/warehouse/assign", (req, res) => {
  const { cartId, userId, items, address } = req.body;
  console.log(
    `[${new Date().toISOString()}] POST /warehouse/assign - CartID: ${cartId}, User: ${userId}`,
  );

  // Simulate warehouse assignment logic with random values
  // These random values will differ between recording and replay
  const assignments = items.map((item) => ({
    itemId: item.itemId,
    itemName: item.name,
    warehouseId: `wh-${Math.floor(Math.random() * 5) + 1}`, // Random warehouse 1-5
    warehouseName: `Warehouse ${Math.floor(Math.random() * 5) + 1}`,
    estimatedDelivery: new Date(
      Date.now() + (3 + Math.floor(Math.random() * 4)) * 24 * 60 * 60 * 1000,
    ).toISOString(), // 3-7 days
    distance: Math.floor(Math.random() * 500) + 50, // 50-550 km
  }));

  // Simulate processing delay
  setTimeout(
    () => {
      res.json({
        cartId: cartId,
        userId: userId,
        assignments: assignments,
        assignedAt: new Date().toISOString(),
      });
    },
    Math.floor(Math.random() * 100) + 50,
  ); // 50-150ms delay
});

// Health check
app.get("/health", (req, res) => {
  console.log(`[${new Date().toISOString()}] GET /health`);
  res.json({
    status: "ok",
    service: "warehouse",
    timestamp: new Date().toISOString(),
  });
});

// Start server
const PORT = process.env.PORT || 8081;
app.listen(PORT, () => {
  console.log(`Warehouse Service running on port ${PORT}`);
  console.log("\nAvailable endpoints:");
  console.log("  POST /warehouse/assign - Warehouse assignment service");
  console.log("  GET  /health           - Health check");
});
