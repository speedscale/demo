const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET || 'sessions-demo-signing-key';
const TOKEN_TTL_SECONDS = 3600;

// Load-test escape hatch: any username authenticates with this shared password,
// letting the traffic generator mint thousands of distinct sessions without a
// pre-seeded account per user. Demo-only; never do this in a real service.
const BULK_PASSWORD = process.env.BULK_PASSWORD || 'loadtest';

// ---------------------------------------------------------------------------
// Why this demo exists
//
// proxymock derives an RRPair's `session` field from the inbound Authorization
// header (and from access_token in login responses). The session is what powers
// the Sessions report view. This app deliberately exercises every scheme
// proxymock's auth detector understands so a single recording yields a rich,
// varied set of sessions:
//
//   * JWT bearer with a `uid` claim  -> session is the uid (e.g. alice@example.com)
//   * HTTP Basic                     -> session is the username (e.g. ops-admin)
//   * Opaque bearer (API key)        -> session is the token string (svc accounts)
//   * No auth (e.g. /health)         -> the "unattributed" bucket
//
// The companion client (client/drive.js) drives many distinct actors through
// multi-step journeys with think-time so each session has a real shape.
// ---------------------------------------------------------------------------

// End-user accounts. Keyed by email so a JWT `uid` claim reads as the address —
// the most human-friendly session id in the Sessions view. Passwords are fake.
const USERS = {
  'alice@example.com': { password: 'wonderland', name: 'Alice Adams', role: 'customer' },
  'bob@example.com': { password: 'builder', name: 'Bob Brown', role: 'customer' },
  'carol@example.com': { password: 'changeme', name: 'Carol Chen', role: 'premium' },
  'dave@example.com': { password: 'hunter2', name: 'Dave Diaz', role: 'customer' },
  'erin@example.com': { password: 'passw0rd', name: 'Erin Estrada', role: 'premium' },
};

// HTTP Basic operators. proxymock turns Basic auth into a username session, so
// these show up as human-named sessions distinct from the JWT addresses.
const BASIC_USERS = {
  'ops-admin': { password: 'opspass', name: 'Ops Admin', role: 'admin' },
  'support-agent': { password: 'supportpass', name: 'Support Agent', role: 'support' },
};

// Opaque API keys for machine clients. An opaque bearer has no claims to mine,
// so proxymock uses the token string itself as the session — modeling
// service-account traffic alongside human sessions. Fake keys.
const API_KEYS = {
  'sk_live_billing_7f3a91': { name: 'Billing Service', role: 'service' },
  'sk_live_analytics_2b8c44': { name: 'Analytics Service', role: 'service' },
};

// Product catalog. `p-broken` deliberately 500s so the recording has a server
// error to color the session-level SLO and error-rate columns.
const CATALOG = [
  { id: 'p-1001', name: 'Aeron Chair', price: 1395, category: 'office' },
  { id: 'p-1002', name: 'Standing Desk', price: 699, category: 'office' },
  { id: 'p-1003', name: 'Noise-Cancelling Headphones', price: 349, category: 'audio' },
  { id: 'p-1004', name: 'Mechanical Keyboard', price: 159, category: 'peripherals' },
  { id: 'p-1005', name: 'Ultrawide Monitor', price: 899, category: 'displays' },
  { id: 'p-broken', name: 'Cursed Item', price: 0, category: 'office' },
];

// In-memory state, keyed by session identity.
const carts = new Map(); // identity -> [{ productId, qty }]
const orders = new Map(); // orderId  -> { id, owner, items, total }
let orderSeq = 1000;

// --- JWT (HS256) helpers, hand-rolled to keep the demo dependency-free ------

function b64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signJWT(payload) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifyJWT(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const data = `${parts[0]}.${parts[1]}`;
  const expected = crypto.createHmac('sha256', JWT_SECRET).update(data).digest('base64url');
  try {
    if (!crypto.timingSafeEqual(Buffer.from(parts[2]), Buffer.from(expected))) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

// --- Auth resolution -------------------------------------------------------
// Returns { identity, role, name, scheme } or null. `identity` is what we
// expect proxymock to record as the session.

function resolveAuth(req) {
  const header = req.headers['authorization'];
  if (!header) return null;
  const [scheme, value] = header.split(' ');
  if (!scheme || !value) return null;

  if (scheme.toLowerCase() === 'basic') {
    const decoded = Buffer.from(value, 'base64').toString();
    const idx = decoded.indexOf(':');
    if (idx < 0) return null;
    const user = decoded.slice(0, idx);
    const pass = decoded.slice(idx + 1);
    const found = BASIC_USERS[user];
    if (found && found.password === pass) {
      return { identity: user, role: found.role, name: found.name, scheme: 'basic' };
    }
    return null;
  }

  if (scheme.toLowerCase() === 'bearer') {
    const key = API_KEYS[value];
    if (key) return { identity: value, role: key.role, name: key.name, scheme: 'apikey' };
    const claims = verifyJWT(value);
    if (claims) return { identity: claims.uid, role: claims.role, name: claims.name, scheme: 'jwt' };
    return null;
  }

  return null;
}

// --- Response helpers ------------------------------------------------------

function send(res, code, obj) {
  const body = obj === undefined ? '' : JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve({});
      }
    });
  });
}

// --- Routes ----------------------------------------------------------------

async function route(req, res, path) {
  const method = req.method;

  // Public health check — no auth, so these land in the unattributed bucket.
  if (method === 'GET' && path === '/health') {
    return send(res, 200, { status: 'ok', service: 'sessions-demo' });
  }

  // Login: issue a JWT whose `uid` claim is the user's email. proxymock reads
  // access_token from this response and attributes the call to that uid, so the
  // login itself joins the user's session.
  if (method === 'POST' && path === '/login') {
    const body = await readBody(req);
    let user = USERS[body.username];
    if (user) {
      if (user.password !== body.password) {
        return send(res, 401, { error: 'invalid_credentials' });
      }
    } else if (body.username && body.password === BULK_PASSWORD) {
      // Synthetic load-test actor: accept and attribute to the supplied username.
      user = { name: body.username, role: 'customer' };
    } else {
      return send(res, 401, { error: 'invalid_credentials' });
    }
    const now = Math.floor(Date.now() / 1000);
    const access_token = signJWT({
      sub: body.username,
      uid: body.username,
      name: user.name,
      role: user.role,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS,
    });
    return send(res, 200, {
      access_token,
      token_type: 'Bearer',
      expires_in: TOKEN_TTL_SECONDS,
      user: { email: body.username, name: user.name, role: user.role },
    });
  }

  // Everything below requires authentication.
  const auth = resolveAuth(req);
  if (!auth) return send(res, 401, { error: 'unauthorized' });

  if (method === 'GET' && path === '/account') {
    return send(res, 200, { identity: auth.identity, name: auth.name, role: auth.role, scheme: auth.scheme });
  }

  if (method === 'GET' && path === '/catalog') {
    return send(res, 200, { products: CATALOG.filter((p) => p.id !== 'p-broken') });
  }

  if (method === 'GET' && path.startsWith('/catalog/')) {
    const id = path.slice('/catalog/'.length);
    if (id === 'p-broken') {
      return send(res, 500, { error: 'internal_error', detail: 'inventory service unavailable' });
    }
    const product = CATALOG.find((p) => p.id === id);
    if (!product) return send(res, 404, { error: 'not_found' });
    return send(res, 200, product);
  }

  if (method === 'GET' && path === '/cart') {
    return send(res, 200, { items: carts.get(auth.identity) || [] });
  }

  if (method === 'POST' && path === '/cart/items') {
    const body = await readBody(req);
    const product = CATALOG.find((p) => p.id === body.productId);
    if (!product) return send(res, 404, { error: 'unknown_product' });
    const cart = carts.get(auth.identity) || [];
    cart.push({ productId: body.productId, qty: Number(body.qty) || 1 });
    carts.set(auth.identity, cart);
    return send(res, 200, { items: cart });
  }

  if (method === 'POST' && path === '/orders') {
    const cart = carts.get(auth.identity) || [];
    if (!cart.length) return send(res, 400, { error: 'empty_cart' });
    const total = cart.reduce((sum, item) => {
      const product = CATALOG.find((p) => p.id === item.productId);
      return sum + (product ? product.price * item.qty : 0);
    }, 0);
    const id = `o-${orderSeq++}`;
    orders.set(id, { id, owner: auth.identity, items: cart, total });
    carts.set(auth.identity, []);
    return send(res, 201, { orderId: id, total, items: cart });
  }

  if (method === 'GET' && path.startsWith('/orders/')) {
    const id = path.slice('/orders/'.length);
    const order = orders.get(id);
    if (!order) return send(res, 404, { error: 'not_found' });
    if (order.owner !== auth.identity && auth.role !== 'admin') {
      return send(res, 403, { error: 'forbidden' });
    }
    return send(res, 200, order);
  }

  // Admin/service only — customers hitting this produce a 403, which enriches
  // the per-session error rate.
  if (method === 'GET' && path === '/admin/metrics') {
    if (auth.role !== 'admin' && auth.role !== 'service') {
      return send(res, 403, { error: 'forbidden' });
    }
    return send(res, 200, {
      orders: orders.size,
      activeCarts: [...carts.values()].filter((c) => c.length).length,
    });
  }

  if (method === 'POST' && path === '/logout') {
    return send(res, 204);
  }

  return send(res, 404, { error: 'not_found' });
}

const server = http.createServer((req, res) => {
  const path = req.url.split('?')[0];
  route(req, res, path).catch((err) => {
    send(res, 500, { error: 'internal_error', detail: String(err && err.message) });
  });
});

server.listen(PORT, () => {
  console.log(`sessions-demo listening on http://localhost:${PORT}`);
});
