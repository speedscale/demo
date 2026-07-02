// One binary, four roles. Set SERVICE to pick which service this process is.
//
//   SERVICE=gateway  PORT=3001   (edge; POST /checkout)
//   SERVICE=auth     PORT=3002   (GET  /whoami)
//   SERVICE=orders   PORT=3003   (POST /orders)
//   SERVICE=shipping PORT=3004   (POST /ship)
//
// The point of this app is to thread ONE identifier — the customer's
// email — through every field type proxymock can search:
//
//   * HTTP header      X-User-Email  (on every hop)
//   * request body     { "email": ... } on checkout / orders / ship
//   * response body    { "email": ... } echoed by auth / orders / shipping
//
// so that a single Full Text filter on that email in proxymock-web
// lights up the whole transaction — no trace IDs required. A W3C
// `traceparent` is also propagated unchanged across the transaction so
// the waterfall can nest hops, but it is NOT what we filter on.

import axios from 'axios';
import express from 'express';
import morgan from 'morgan';

const SERVICE = process.env.SERVICE || 'gateway';
const PORT = Number(process.env.PORT || 3001);

// Downstream base URLs. record-all.sh overrides these with *.local
// hostnames so each hop is captured against a distinct upstream host
// (the waterfall's Host column). Defaults keep a plain `node server.js`
// runnable on one machine.
const AUTH_URL = process.env.AUTH_URL || 'http://localhost:3002';
const ORDERS_URL = process.env.ORDERS_URL || 'http://localhost:3003';
const SHIPPING_URL = process.env.SHIPPING_URL || 'http://localhost:3004';

const app = express();
app.use(express.json());
app.use(morgan('tiny'));

const hex = (n) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');

// nextTraceparent keeps the incoming trace-id but mints a FRESH span-id for
// this outbound hop. That way the caller's OUT and the callee's IN share one
// unique span id per hop, so the trace nests as a tree. Reusing a single
// span id across every hop (the naive "forward traceparent unchanged"
// approach) collapses the graph and can even make the nester cycle.
function nextTraceparent(req) {
  const parts = String(req.get('traceparent') || '').split('-');
  const traceId = parts.length === 4 && parts[1] ? parts[1] : hex(32);
  return `00-${traceId}-${hex(16)}-01`;
}

// Propagate the caller's trace + identity headers to the next hop.
function fwdHeaders(req, extra = {}) {
  const h = { 'content-type': 'application/json', traceparent: nextTraceparent(req), ...extra };
  const email = req.get('x-user-email');
  if (email) h['x-user-email'] = email;
  return h;
}

// axios (unlike node's built-in fetch) honors http_proxy / https_proxy, so
// proxymock captures these inter-service calls on its outbound proxy.
async function postJSON(url, body, headers) {
  const res = await axios.post(url, body, { headers });
  return res.data;
}

app.get('/healthz', (_req, res) => res.send({ health: 'y' }));

if (SERVICE === 'gateway') {
  // Edge service. The customer's email arrives in the request body AND
  // an X-User-Email header, then fans out to auth -> orders -> shipping.
  app.post('/checkout', async (req, res) => {
    const email = req.body.email;

    // Fresh headers per downstream call so each hop gets its own span id.
    const who = await postJSON(`${AUTH_URL}/whoami`, { email }, fwdHeaders(req, { 'x-user-email': email }));
    const order = await postJSON(`${ORDERS_URL}/orders`, {
      email,
      items: req.body.cart || [],
    }, fwdHeaders(req, { 'x-user-email': email }));

    res.send({
      email,
      status: 'confirmed',
      roles: who.roles,
      orderId: order.orderId,
      total: order.total,
      eta: order.eta,
    });
  });
}

if (SERVICE === 'auth') {
  // Identity service. Reads the email from the request body (or header)
  // and echoes it back in the RESPONSE body — so the same string is
  // present on both sides of this hop.
  app.post('/whoami', (req, res) => {
    const email = req.body.email || req.get('x-user-email') || 'unknown';
    res.send({ email, roles: ['customer'], verified: true });
  });
}

if (SERVICE === 'orders') {
  app.post('/orders', async (req, res) => {
    const email = req.body.email;
    const orderId = 'ord-' + Math.random().toString(36).slice(2, 10);
    const total = (req.body.items || []).reduce((s, i) => s + (i.price || 9.99), 0) || 9.99;

    const ship = await postJSON(`${SHIPPING_URL}/ship`, { email, orderId }, fwdHeaders(req));

    res.send({ email, orderId, total, eta: ship.eta });
  });
}

if (SERVICE === 'shipping') {
  app.post('/ship', (req, res) => {
    const email = req.body.email;
    res.send({ email, orderId: req.body.orderId, eta: '2 business days', carrier: 'speedpost' });
  });
}

app.listen(PORT, () => console.log(`${SERVICE} listening on :${PORT}`));
