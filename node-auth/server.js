const http = require('http');
const crypto = require('crypto');

const PORT = 3000;

const validTokens = new Set();

function generateToken() {
  return crypto.randomBytes(32).toString('hex');
}

function parseAuthHeader(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.substring(7);
}

const server = http.createServer((req, res) => {
  const { method, url } = req;

  res.setHeader('Content-Type', 'application/json');

  if (method === 'POST' && url === '/oauth/token') {
    const token = generateToken();
    validTokens.add(token);

    res.statusCode = 200;
    res.end(JSON.stringify({
      access_token: token,
      token_type: 'Bearer',
      expires_in: 3600
    }));
    return;
  }

  if (method === 'GET' && url === '/protected') {
    const authHeader = req.headers['authorization'];
    const token = parseAuthHeader(authHeader);

    if (!token || !validTokens.has(token)) {
      res.statusCode = 403;
      res.end(JSON.stringify({
        error: 'forbidden',
        message: 'Invalid or missing Bearer token'
      }));
      return;
    }

    res.statusCode = 200;
    res.end(JSON.stringify({
      message: 'Access granted to protected resource',
      data: {
        userId: 123,
        username: 'demo-user'
      }
    }));
    return;
  }

  if (method === 'GET' && url === '/public') {
    res.statusCode = 200;
    res.end(JSON.stringify({
      message: 'Public endpoint - no authentication required',
      data: {
        timestamp: new Date().toISOString(),
        status: 'ok'
      }
    }));
    return;
  }

  res.statusCode = 404;
  res.end(JSON.stringify({
    error: 'not_found',
    message: 'Endpoint not found'
  }));
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log('\nAvailable endpoints:');
  console.log('  POST /oauth/token - Get an access token');
  console.log('  GET /protected - Protected endpoint (requires Bearer token)');
  console.log('  GET /public - Public endpoint (no auth required)');
});
