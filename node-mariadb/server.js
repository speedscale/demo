const express = require('express');
const mariadb = require('mariadb');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

// ---------------------------------------------------------------------------
// Configuration (all from env vars with sensible defaults)
// ---------------------------------------------------------------------------
const PORT = parseInt(process.env.PORT || '3001', 10);
const DB_HOST = process.env.DB_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DB_PORT || '3306', 10);
const DB_USER = process.env.DB_USER || 'demo';
const DB_PASSWORD = process.env.DB_PASSWORD || 'demo_password';
const DB_NAME = process.env.DB_NAME || 'demo';
const DB_SSL_CA = process.env.DB_SSL_CA || '';  // path to CA cert
const JWT_SECRET = process.env.JWT_SECRET || 'demo-secret-key';

// ---------------------------------------------------------------------------
// MariaDB connection pool
// ---------------------------------------------------------------------------
function buildPoolConfig() {
  const cfg = {
    host: DB_HOST,
    port: DB_PORT,
    user: DB_USER,
    password: DB_PASSWORD,
    database: DB_NAME,
    connectionLimit: 5,
    acquireTimeout: 10000,
  };

  // Enable TLS when a CA certificate is provided
  if (DB_SSL_CA && fs.existsSync(DB_SSL_CA)) {
    cfg.ssl = {
      ca: fs.readFileSync(DB_SSL_CA, 'utf8'),
      rejectUnauthorized: false,
    };
    console.log(`TLS enabled – CA cert loaded from ${DB_SSL_CA}`);
  } else {
    console.log('TLS disabled – set DB_SSL_CA to a CA certificate path to enable');
  }

  return cfg;
}

const pool = mariadb.createPool(buildPoolConfig());

// ---------------------------------------------------------------------------
// Database bootstrap – create table if it does not exist
// ---------------------------------------------------------------------------
async function initDb() {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.query(`
      CREATE TABLE IF NOT EXISTS products (
        id        INT AUTO_INCREMENT PRIMARY KEY,
        name      VARCHAR(255) NOT NULL,
        price     DECIMAL(10,2) NOT NULL DEFAULT 0,
        quantity  INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('Database initialised (products table ready)');

    // Seed a few rows when the table is empty
    const [{ cnt }] = await conn.query('SELECT COUNT(*) AS cnt FROM products');
    if (cnt === 0) {
      await conn.batch(
        'INSERT INTO products (name, price, quantity) VALUES (?, ?, ?)',
        [
          ['Widget A', 9.99, 100],
          ['Widget B', 19.99, 50],
          ['Gadget C', 49.99, 25],
        ]
      );
      console.log('Seeded 3 sample products');
    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id        INT AUTO_INCREMENT PRIMARY KEY,
        username  VARCHAR(50)  NOT NULL UNIQUE,
        password  VARCHAR(100) NOT NULL,
        user_id   VARCHAR(20)  NOT NULL,
        shift     VARCHAR(20)  NOT NULL DEFAULT 'day'
      )
    `);

    const shiftUsers = [
      ['aurora', 'sunrise-key', 'u-001', 'day'],
      ['basil', 'brisk-morning', 'u-002', 'day'],
      ['clover', 'coffee-break', 'u-003', 'day'],
      ['dawn', 'daylight-run', 'u-004', 'day'],
      ['ember', 'early-bird', 'u-005', 'day'],
      ['vesper', 'twilight-run', 'u-006', 'night'],
      ['wren', 'work-late', 'u-007', 'night'],
      ['xenia', 'xtra-shift', 'u-008', 'night'],
      ['yarrow', 'yard-light', 'u-009', 'night'],
      ['zephyr', 'zero-sun', 'u-010', 'night'],
    ];

    for (const user of shiftUsers) {
      await conn.query(
        `INSERT INTO users (username, password, user_id, shift)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           password = VALUES(password),
           user_id = VALUES(user_id),
           shift = VALUES(shift)`,
        user
      );
    }
    console.log('Ensured 10 shift workers are present');
  } finally {
    if (conn) conn.release();
  }
}

// ---------------------------------------------------------------------------
// Express app
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json());

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header' });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (_err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Health check
app.get('/health', async (_req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    await conn.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(503).json({ status: 'error', db: err.message });
  } finally {
    if (conn) conn.release();
  }
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password required' });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query(
      'SELECT * FROM users WHERE username = ? AND password = ?',
      [username, password]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = rows[0];
    const token = jwt.sign(
      { id: user.id, username: user.username, user_id: user.user_id, shift: user.shift },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.json({
      token,
      user: { id: user.id, username: user.username, user_id: user.user_id, shift: user.shift },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// List products
app.get('/products', requireAuth, async (_req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT * FROM products ORDER BY id');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// Get single product
app.get('/products/:id', requireAuth, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const rows = await conn.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// Create product
app.post('/products', requireAuth, async (req, res) => {
  const { name, price, quantity } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  let conn;
  try {
    conn = await pool.getConnection();
    const result = await conn.query(
      'INSERT INTO products (name, price, quantity) VALUES (?, ?, ?)',
      [name, price || 0, quantity || 0]
    );
    const inserted = await conn.query('SELECT * FROM products WHERE id = ?', [result.insertId]);
    res.status(201).json(inserted[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// Update product
app.put('/products/:id', requireAuth, async (req, res) => {
  const { name, price, quantity } = req.body;
  let conn;
  try {
    conn = await pool.getConnection();
    const existing = await conn.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    if (existing.length === 0) return res.status(404).json({ error: 'not found' });

    await conn.query(
      'UPDATE products SET name = ?, price = ?, quantity = ? WHERE id = ?',
      [
        name ?? existing[0].name,
        price ?? existing[0].price,
        quantity ?? existing[0].quantity,
        req.params.id,
      ]
    );
    const updated = await conn.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    res.json(updated[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// Delete product
app.delete('/products/:id', requireAuth, async (req, res) => {
  let conn;
  try {
    conn = await pool.getConnection();
    const result = await conn.query('DELETE FROM products WHERE id = ?', [req.params.id]);
    if (result.affectedRows === 0) return res.status(404).json({ error: 'not found' });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    if (conn) conn.release();
  }
});

// Catch-all
app.use((_req, res) => {
  res.status(404).json({ error: 'not_found', message: 'Endpoint not found' });
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`\nNode-MariaDB demo listening on http://localhost:${PORT}`);
      console.log('\nEndpoints (via KrakenD on :8080):');
      console.log('  GET    /health');
      console.log('  POST   /login');
      console.log('  GET    /products    (auth required)');
      console.log('  GET    /products/:id (auth required)');
      console.log('  POST   /products    (auth required)');
      console.log('  PUT    /products/:id (auth required)');
      console.log('  DELETE /products/:id (auth required)');
    });
  })
  .catch((err) => {
    console.error('Failed to initialise database:', err);
    process.exit(1);
  });
