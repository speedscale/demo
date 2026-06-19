const http = require('http');
const crypto = require('crypto');

const PORT = 3000;
const TOKEN_TTL_SECONDS = 3600;

// --- OAuth2 clients (client_id -> client_secret) ---------------------------
// Real OAuth2 token endpoints authenticate the *client* with HTTP Basic
// (RFC 6749 §2.3.1) before issuing a token: the Authorization header carries
// base64(client_id:client_secret). These are confidential-client secrets, a
// separate credential class from end-user passwords below.
const oauthClients = {
  'demo-client': 'demo-secret',
  'partner-app': 'partner-secret'
};

// --- End-user credentials (username -> valid passwords) --------------------
// Used both for HTTP Basic protected resources (/basic/*) and the OAuth2
// password grant. `admin` carries two passwords to model a rotation window
// where the old and new secrets are both temporarily accepted.
const userCredentials = {
  'admin': ['secret123', 'secret456'],
  'user1': ['password1'],
  'readonly': ['readerpass']
};

const userRoles = {
  'admin': 'admin',
  'user1': 'user',
  'readonly': 'readonly'
};

// --- Synthetic PII dataset (for proxymock "Identify PII" demos) -------------
// Everything below is FAKE data, chosen purely to give proxymock's PII
// detection a broad variety to discover: email addresses, US SSNs, credit
// card numbers, E.164 phone numbers, dates of birth, and IP addresses. Card
// numbers are the well-known public test numbers (Visa/Mastercard/Amex) and
// phone numbers use the 555 fictional range, so nothing here maps to a real
// person or a live account.
const customers = [
  {
    id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
    name: 'Alice Johnson',
    email: 'alice.johnson@example.com',
    phone: '+14155550101',
    ssn: '123-45-6789',
    creditCard: '4111111111111111',
    dateOfBirth: '1985-03-12',
    ipAddress: '203.0.113.42',
    address: { street: '742 Evergreen Terrace', city: 'Springfield', state: 'OR', zip: '97477' }
  },
  {
    id: 'b3d8f1a2-5c6e-4f70-9a1b-2c3d4e5f6071',
    name: 'Bob Martinez',
    email: 'bob.martinez@example.org',
    phone: '+14155550199',
    ssn: '987-65-4320',
    creditCard: '5555555555554444',
    dateOfBirth: '1979-11-30',
    ipAddress: '198.51.100.17',
    address: { street: '1600 Pennsylvania Ave', city: 'Washington', state: 'DC', zip: '20500' }
  },
  {
    id: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    name: 'Carol Nguyen',
    email: 'carol.nguyen@example.net',
    phone: '+442071838750',
    ssn: '456-78-9012',
    creditCard: '378282246310005',
    dateOfBirth: '1992-06-04',
    ipAddress: '2001:db8::8a2e:370:7334',
    address: { street: '221B Baker Street', city: 'London', state: '', zip: 'NW1 6XE' }
  }
];

// End-user profiles for the OIDC-style /me endpoint, keyed by the OAuth
// subject. These intentionally carry PII so an authenticated profile call —
// and the signed id_token it returns — both surface detectable fields.
const userProfiles = {
  admin:    { name: 'Admin User',  email: 'admin@example.com',    phone: '+14155550123', ssn: '111-22-3333', dateOfBirth: '1980-01-15' },
  user1:    { name: 'Pat Lee',     email: 'pat.lee@example.com',  phone: '+14155550148', ssn: '222-33-4444', dateOfBirth: '1990-09-09' },
  readonly: { name: 'Sam Reader',  email: 'sam.reader@example.com', phone: '+14155550172', ssn: '333-44-5555', dateOfBirth: '1975-12-25' }
};

// Issued access tokens: token -> { sub, scope, exp (epoch ms) }.
const issuedTokens = new Map();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

// base64url encodes a Buffer/string per RFC 7515 (no padding, URL alphabet).
function base64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// signJWT builds a compact HS256 JWT. Hand-rolled (no deps) so the demo can
// hand back a *real* JWT whose claims carry PII — exercising proxymock's
// JWT-claim detection, which decodes Bearer tokens and walks their payload.
function signJWT(payload, secret) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64url(JSON.stringify(payload));
  const data = `${header}.${body}`;
  const sig = base64url(crypto.createHmac('sha256', secret).update(data).digest());
  return `${data}.${sig}`;
}

const ID_TOKEN_SECRET = 'demo-id-token-signing-secret';

// parseBasicHeader returns { id, secret } from an "Authorization: Basic <b64>"
// header, or null when absent/malformed. Per RFC 7617 the first colon splits
// the two halves; the secret may itself contain colons.
function parseBasicHeader(authHeader) {
  if (!authHeader || !authHeader.startsWith('Basic ')) return null;
  const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf8');
  const colon = decoded.indexOf(':');
  if (colon === -1) return null;
  return { id: decoded.slice(0, colon), secret: decoded.slice(colon + 1) };
}

function parseBearerHeader(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  return authHeader.slice(7);
}

function validateUser(username, password) {
  const valid = userCredentials[username];
  return !!valid && valid.includes(password);
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
  });
}

function sendJSON(res, status, payload, headers) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  if (headers) for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(JSON.stringify(payload));
}

// --- POST /oauth/token -----------------------------------------------------
// OAuth2 token endpoint. Authenticates the client with HTTP Basic, then issues
// a Bearer token for the client_credentials or password grant.
async function handleToken(req, res) {
  // 1. Client authentication (RFC 6749 §2.3.1). A failure here is 401 with a
  //    WWW-Authenticate challenge, distinct from a bad grant (400).
  const client = parseBasicHeader(req.headers['authorization']);
  if (!client || oauthClients[client.id] !== client.secret) {
    return sendJSON(res, 401, {
      error: 'invalid_client',
      error_description: 'client authentication failed'
    }, { 'WWW-Authenticate': 'Basic realm="oauth", charset="UTF-8"' });
  }

  // 2. The token endpoint takes application/x-www-form-urlencoded parameters.
  const params = new URLSearchParams(await readBody(req));
  const grantType = params.get('grant_type');
  let subject;
  let scope = params.get('scope') || 'read';

  if (grantType === 'client_credentials') {
    subject = client.id;
  } else if (grantType === 'password') {
    // Resource Owner Password Credentials grant: the client relays the
    // end-user's username/password in the body.
    const username = params.get('username');
    const password = params.get('password');
    if (!validateUser(username, password)) {
      return sendJSON(res, 400, {
        error: 'invalid_grant',
        error_description: 'invalid resource owner credentials'
      });
    }
    subject = username;
    if (userRoles[username] === 'admin') scope = 'read write admin';
  } else {
    return sendJSON(res, 400, {
      error: 'unsupported_grant_type',
      error_description: `grant_type '${grantType || ''}' is not supported`
    });
  }

  const token = generateToken();
  issuedTokens.set(token, { sub: subject, scope, exp: Date.now() + TOKEN_TTL_SECONDS * 1000 });

  return sendJSON(res, 200, {
    access_token: token,
    token_type: 'Bearer',
    expires_in: TOKEN_TTL_SECONDS,
    scope
  });
}

// authenticateBearer validates the Bearer token and required scope. On failure
// it writes a 401 with an RFC 6750 WWW-Authenticate challenge and returns null.
function authenticateBearer(req, res, requiredScope) {
  const token = parseBearerHeader(req.headers['authorization']);
  const info = token && issuedTokens.get(token);
  if (!info) {
    sendJSON(res, 401, {
      error: 'invalid_token',
      error_description: 'missing or unknown access token'
    }, { 'WWW-Authenticate': 'Bearer realm="api", error="invalid_token"' });
    return null;
  }
  if (Date.now() > info.exp) {
    issuedTokens.delete(token);
    sendJSON(res, 401, {
      error: 'invalid_token',
      error_description: 'the access token expired'
    }, { 'WWW-Authenticate': 'Bearer realm="api", error="invalid_token", error_description="The access token expired"' });
    return null;
  }
  if (requiredScope && !info.scope.split(' ').includes(requiredScope)) {
    sendJSON(res, 403, {
      error: 'insufficient_scope',
      error_description: `requires scope '${requiredScope}'`
    }, { 'WWW-Authenticate': `Bearer realm="api", error="insufficient_scope", scope="${requiredScope}"` });
    return null;
  }
  return info;
}

// authenticateBasicUser validates an HTTP Basic user credential against the
// realm. On failure it writes a 401 challenge and returns null.
function authenticateBasicUser(req, res, realm) {
  const creds = parseBasicHeader(req.headers['authorization']);
  if (!creds || !validateUser(creds.id, creds.secret)) {
    sendJSON(res, 401, {
      error: 'unauthorized',
      message: 'invalid or missing Basic auth credentials'
    }, { 'WWW-Authenticate': `Basic realm="${realm}"` });
    return null;
  }
  return { username: creds.id, role: userRoles[creds.id] || 'unknown' };
}

const server = http.createServer(async (req, res) => {
  const { method, url } = req;

  // --- OAuth2 token endpoint ---
  if (method === 'POST' && url === '/oauth/token') {
    return handleToken(req, res);
  }

  // --- Bearer-protected resource ---
  if (method === 'GET' && url === '/protected') {
    const info = authenticateBearer(req, res, 'read');
    if (!info) return;
    return sendJSON(res, 200, {
      message: 'Access granted to protected resource',
      data: { subject: info.sub, scope: info.scope }
    });
  }

  // --- Public resource ---
  if (method === 'GET' && url === '/public') {
    return sendJSON(res, 200, {
      message: 'Public endpoint - no authentication required',
      data: { timestamp: new Date().toISOString(), status: 'ok' }
    });
  }

  // --- HTTP Basic protected resources (end-user credentials) ---
  if (method === 'GET' && url === '/basic/protected') {
    const user = authenticateBasicUser(req, res, 'Protected Area');
    if (!user) return;
    return sendJSON(res, 200, {
      message: 'Access granted to basic protected resource',
      data: { username: user.username, role: user.role }
    });
  }

  if (method === 'GET' && url === '/basic/admin') {
    const user = authenticateBasicUser(req, res, 'Admin Area');
    if (!user) return;
    if (user.role !== 'admin') {
      return sendJSON(res, 403, { error: 'forbidden', message: 'Admin role required' });
    }
    return sendJSON(res, 200, {
      message: 'Admin access granted',
      data: { username: user.username, permissions: ['read', 'write', 'delete'] }
    });
  }

  if (method === 'GET' && url === '/basic/status') {
    const user = authenticateBasicUser(req, res, 'Status');
    if (!user) return;
    return sendJSON(res, 200, {
      message: 'System status',
      data: {
        username: user.username,
        role: user.role,
        uptime: process.uptime(),
        status: 'operational'
      }
    });
  }

  // ====================== PII demo endpoints ===============================
  // Parsed separately so path params (/customers/:id) and query strings
  // (/search?email=) don't have to fight the exact-match routing above.
  const parsed = new URL(url, `http://${req.headers.host || 'localhost'}`);
  const path = parsed.pathname;

  // --- List customers (response-body PII, many records) ---
  // A list endpoint gives the detector multiple records carrying the same
  // fields, so PII findings group/count across rows the way real traffic does.
  if (method === 'GET' && path === '/customers') {
    return sendJSON(res, 200, { count: customers.length, customers });
  }

  // --- Single customer (response-body PII + a PII response header) ---
  if (method === 'GET' && path.startsWith('/customers/')) {
    const id = decodeURIComponent(path.slice('/customers/'.length));
    const customer = customers.find(c => c.id === id);
    if (!customer) {
      return sendJSON(res, 404, { error: 'not_found', message: `no customer ${id}` });
    }
    // Echo an email into a response header too — PII shows up outside bodies.
    return sendJSON(res, 200, { customer }, { 'X-Customer-Email': customer.email });
  }

  // --- Create customer (request-body PII, echoed back) ---
  // The POST body carries the PII; the detector sees it on the request side,
  // and the echo surfaces it on the response side as well.
  if (method === 'POST' && path === '/customers') {
    let input = {};
    try { input = JSON.parse(await readBody(req) || '{}'); } catch (_) { /* tolerate junk */ }
    const created = {
      id: crypto.randomUUID(),
      name: input.name || 'New Customer',
      email: input.email || 'new.customer@example.com',
      phone: input.phone || '+14155550110',
      ssn: input.ssn || '321-54-9876',
      creditCard: input.creditCard || '6011000990139424',
      dateOfBirth: input.dateOfBirth || '2000-01-01',
      ipAddress: req.socket.remoteAddress || '203.0.113.7'
    };
    customers.push(created);
    return sendJSON(res, 201, { message: 'customer created', customer: created });
  }

  // --- Order with nested payment PII ---
  if (method === 'GET' && path.startsWith('/orders/')) {
    const orderId = decodeURIComponent(path.slice('/orders/'.length));
    const customer = customers[0];
    return sendJSON(res, 200, {
      order: {
        id: orderId,
        placedAt: new Date().toISOString(),
        customer: { name: customer.name, email: customer.email, phone: customer.phone },
        payment: {
          method: 'card',
          cardNumber: customer.creditCard,
          cardExpiry: '11/27',
          cvv: '123',
          billingZip: customer.address.zip
        },
        billingAddress: customer.address,
        total: '149.99'
      }
    });
  }

  // --- Search by query-param PII (?email= &phone= &ssn=) ---
  // Demonstrates PII arriving in query parameters, not just bodies.
  if (method === 'GET' && path === '/search') {
    const email = parsed.searchParams.get('email');
    const phone = parsed.searchParams.get('phone');
    const ssn = parsed.searchParams.get('ssn');
    const matches = customers.filter(c =>
      (email && c.email === email) || (phone && c.phone === phone) || (ssn && c.ssn === ssn));
    return sendJSON(res, 200, {
      query: { email, phone, ssn },
      matchCount: matches.length,
      matches
    });
  }

  // --- OIDC-style profile (Bearer) returning PII + a JWT id_token ---
  // The id_token is a real signed JWT whose claims (email, phone_number,
  // birthdate) carry PII — this exercises proxymock's JWT-claim detection,
  // which decodes the Bearer/id_token and walks the payload.
  if (method === 'GET' && path === '/me') {
    const info = authenticateBearer(req, res, 'read');
    if (!info) return;
    const profile = userProfiles[info.sub] || userProfiles.user1;
    const now = Math.floor(Date.now() / 1000);
    const idToken = signJWT({
      sub: info.sub,
      name: profile.name,
      email: profile.email,
      phone_number: profile.phone,
      birthdate: profile.dateOfBirth,
      iat: now,
      exp: now + TOKEN_TTL_SECONDS
    }, ID_TOKEN_SECRET);
    return sendJSON(res, 200, {
      profile: { sub: info.sub, ...profile },
      id_token: idToken
    });
  }

  return sendJSON(res, 404, { error: 'not_found', message: 'Endpoint not found' });
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log('\nAvailable endpoints:');
  console.log('  POST /oauth/token    - OAuth2 token endpoint (client Basic auth + grant_type)');
  console.log('  GET  /protected      - Bearer-protected resource (requires "read" scope)');
  console.log('  GET  /public         - Public endpoint (no auth)');
  console.log('  GET  /basic/protected - HTTP Basic protected resource');
  console.log('  GET  /basic/admin    - HTTP Basic admin-only resource');
  console.log('  GET  /basic/status   - HTTP Basic status resource');
  console.log('\nPII demo endpoints (synthetic data for "Identify PII"):');
  console.log('  GET  /customers      - list customers (email, SSN, card, phone, DOB, IP)');
  console.log('  GET  /customers/:id  - one customer (+ X-Customer-Email response header)');
  console.log('  POST /customers      - create customer (PII in request body)');
  console.log('  GET  /orders/:id     - order with nested payment PII (card, CVV, billing)');
  console.log('  GET  /search?email=&phone=&ssn= - PII in query parameters');
  console.log('  GET  /me             - Bearer-protected profile + JWT id_token w/ PII claims');
  console.log('\nOAuth2 clients (HTTP Basic on /oauth/token):');
  console.log('  demo-client / demo-secret');
  console.log('  partner-app / partner-secret');
  console.log('\nEnd-user credentials (HTTP Basic on /basic/*, or password grant):');
  console.log('  admin / secret123 or secret456 (admin role, rotated password)');
  console.log('  user1 / password1 (user role)');
  console.log('  readonly / readerpass (readonly role)');
});
