const express = require('express');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

// In-memory database
const users = new Map();
const orders = new Map();

// JWT secret
const JWT_SECRET = 'demo-secret-key';

// Initialize demo data
function initializeDemoData() {
  // Create some demo users with realistic IDs
  const demoUsers = [
    { id: 'sarah-martinez', email: 'sarah.martinez@example.com', name: 'Sarah Martinez' },
    { id: 'dkim', email: 'david.kim@example.com', name: 'David Kim' },
    { id: 'emma', email: 'emma.thompson@example.com', name: 'Emma Thompson' },
    { id: 'arod', email: 'alex.rodriguez@example.com', name: 'Alex Rodriguez' },
    { id: 'jess', email: 'jessica.brown@example.com', name: 'Jessica Brown' }
  ];
  
  demoUsers.forEach(user => {
    users.set(user.id, { ...user, password: 'password123' });
  });
}

// Initialize data on startup
initializeDemoData();

// Auth endpoints
app.post('/auth/login', (req, res) => {
  console.log(`[${new Date().toISOString()}] POST /auth/login - Email: ${req.body.email}`);
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
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  
  // Generate JWT with user ID
  const token = jwt.sign(
    { userId: foundUser.id, email: foundUser.email },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
  
  res.json({
    token,
    userId: foundUser.id,
    message: 'Login successful'
  });
});

// Middleware to verify JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
}

// User endpoints
app.get('/users/me', authenticateToken, (req, res) => {
  console.log(`[${new Date().toISOString()}] GET /users/me - Requested by: ${req.user.email}`);
  const user = users.get(req.user.userId);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Return user without password
  const { password, ...userInfo } = user;
  res.json(userInfo);
});

app.get('/users/:userId', authenticateToken, (req, res) => {
  console.log(`[${new Date().toISOString()}] GET /users/${req.params.userId} - Requested by: ${req.user.email}`);
  const { userId } = req.params;
  const user = users.get(userId);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  // Return user without password
  const { password, ...userInfo } = user;
  res.json(userInfo);
});

// Order endpoints
app.post('/orders', authenticateToken, (req, res) => {
  console.log(`[${new Date().toISOString()}] POST /orders - User: ${req.user.email}, Total: $${req.body.totalAmount}`);
  const { items, totalAmount } = req.body;
  const orderId = `order-${uuidv4()}`;
  
  const order = {
    id: orderId,
    userId: req.user.userId,
    items,
    totalAmount,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  
  orders.set(orderId, order);
  
  res.status(201).json({
    orderId: order.id,
    message: 'Order created successfully',
    order
  });
});

app.get('/orders', authenticateToken, (req, res) => {
  console.log(`[${new Date().toISOString()}] GET /orders?orderId=${req.query.orderId} - Requested by: ${req.user.email}`);
  const { orderId } = req.query;
  const order = orders.get(orderId);
  
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  
  // Verify order belongs to user
  if (order.userId !== req.user.userId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  res.json(order);
});

// Health check
app.get('/health', (req, res) => {
  console.log(`[${new Date().toISOString()}] GET /health`);
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`Smart Replace Demo Server running on port ${PORT}`);
  console.log('\nAvailable endpoints:');
  console.log('  POST /auth/login       - Login with email/password');
  console.log('  GET  /users/me         - Get own profile (requires auth)');
  console.log('  GET  /users/:userId    - Get user profile (requires auth)');
  console.log('  POST /orders           - Create new order (requires auth)');
  console.log('  GET  /orders?orderId=ID - Get order details (requires auth)');
  console.log('  GET  /health           - Health check');
  console.log('\nDemo users:');
  console.log('  sarah.martinez@example.com / password123 (ID: sarah-martinez)');
  console.log('  david.kim@example.com / password123 (ID: david-kim)');
  console.log('  emma.thompson@example.com / password123 (ID: emma-thompson)');
  console.log('  alex.rodriguez@example.com / password123 (ID: alex-rodriguez)');
  console.log('  jessica.brown@example.com / password123 (ID: jessica-brown)');
});