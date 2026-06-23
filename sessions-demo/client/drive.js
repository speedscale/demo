// Traffic generator for sessions-demo.
//
// Drives many distinct actors through multi-step journeys so a proxymock
// recording yields a rich — and, at scale, large — set of sessions. Point BASE
// at the proxymock inbound proxy (default :4143) while recording; point it at
// the app (:3000) for a plain smoke test.
//
//   BASE=http://localhost:4143 node client/drive.js              # ~1000 sessions
//   BASE=http://localhost:4143 SESSIONS=50 node client/drive.js  # smaller run
//
// Env knobs:
//   SESSIONS     total distinct sessions to generate (default 1000)
//   CONCURRENCY  max in-flight sessions (default 40)
//   THINK_MS     max think-time between requests in ms (default 30; set higher
//                e.g. 500 for a realistic-cadence demo with few sessions)
//   VERBOSE      "1" logs every request; otherwise only progress + summary
//
// Requires Node 18+ (global fetch). No external dependencies.

const BASE = process.env.BASE || 'http://localhost:4143';
const SESSIONS = Math.max(1, parseInt(process.env.SESSIONS || '1000', 10));
const CONCURRENCY = Math.max(1, parseInt(process.env.CONCURRENCY || '40', 10));
const THINK_MAX = Math.max(0, parseInt(process.env.THINK_MS || '30', 10));
const VERBOSE = process.env.VERBOSE === '1';
const BULK_PASSWORD = process.env.BULK_PASSWORD || 'loadtest';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (min, max) => Math.floor(min + Math.random() * (max - min));

let totalRequests = 0;

// Flagship personas span every auth scheme proxymock recognizes — JWT (uid
// claim), HTTP Basic (username), opaque API key (token string) — and seed the
// error mix. The bulk synthetic actors below are layered on top to reach
// SESSIONS.
const FLAGSHIP = [
  { kind: 'login', username: 'alice@example.com', password: 'wonderland', journey: 'shopper' },
  { kind: 'login', username: 'bob@example.com', password: 'builder', journey: 'browser' },
  { kind: 'login', username: 'carol@example.com', password: 'changeme', journey: 'shopper' },
  { kind: 'login', username: 'dave@example.com', password: 'hunter2', journey: 'abandoner' },
  { kind: 'login', username: 'erin@example.com', password: 'passw0rd', journey: 'forbidden' },
  { kind: 'basic', username: 'ops-admin', password: 'opspass', journey: 'admin' },
  { kind: 'basic', username: 'support-agent', password: 'supportpass', journey: 'support' },
  { kind: 'apikey', key: 'sk_live_billing_7f3a91', journey: 'service' },
  { kind: 'apikey', key: 'sk_live_analytics_2b8c44', journey: 'service' },
];

// Bulk synthetic actors: JWT logins via the shared load-test password. Journeys
// are short to keep the request volume manageable at scale, and weighted so a
// minority inject 4xx/5xx — enough to make the SLO/error columns interesting
// across thousands of rows.
const BULK_JOURNEYS = ['peek', 'quick', 'quick', 'buy', 'abandoner', 'browser', 'forbidden'];

function buildPersonas() {
  const personas = FLAGSHIP.slice();
  const bulk = Math.max(0, SESSIONS - personas.length);
  const width = String(bulk).length;
  for (let i = 0; i < bulk; i++) {
    personas.push({
      kind: 'login',
      username: `load-${String(i + 1).padStart(width, '0')}@example.com`,
      password: BULK_PASSWORD,
      journey: BULK_JOURNEYS[i % BULK_JOURNEYS.length],
    });
  }
  return personas;
}

async function authHeader(p, label) {
  if (p.kind === 'basic') {
    return 'Basic ' + Buffer.from(`${p.username}:${p.password}`).toString('base64');
  }
  if (p.kind === 'apikey') {
    return `Bearer ${p.key}`;
  }
  const res = await request(label, 'POST', '/login', null, {
    username: p.username,
    password: p.password,
  });
  const token = res.body && res.body.access_token;
  return token ? `Bearer ${token}` : null;
}

async function request(label, method, path, auth, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) headers['Authorization'] = auth;
  totalRequests++;
  let status = 0;
  let parsed;
  try {
    const res = await fetch(BASE + path, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
    status = res.status;
    const text = await res.text();
    parsed = text ? JSON.parse(text) : undefined;
  } catch (e) {
    if (VERBOSE) console.log(`  [${label}] ${method} ${path} -> ERROR ${e.message}`);
    return { status: 0, body: undefined };
  }
  if (VERBOSE) console.log(`  [${label}] ${method} ${path} -> ${status}`);
  return { status, body: parsed };
}

async function step(label, auth, method, path, body) {
  const res = await request(label, method, path, auth, body);
  if (THINK_MAX > 0) await sleep(jitter(0, THINK_MAX));
  return res;
}

const JOURNEYS = {
  // Full purchase funnel.
  async shopper(label, auth) {
    await step(label, auth, 'GET', '/catalog');
    await step(label, auth, 'GET', '/catalog/p-1003');
    await step(label, auth, 'GET', '/catalog/p-1005');
    await step(label, auth, 'POST', '/cart/items', { productId: 'p-1003', qty: 1 });
    await step(label, auth, 'POST', '/cart/items', { productId: 'p-1005', qty: 2 });
    await step(label, auth, 'GET', '/cart');
    const order = await step(label, auth, 'POST', '/orders');
    if (order.body && order.body.orderId) {
      await step(label, auth, 'GET', `/orders/${order.body.orderId}`);
    }
    await step(label, auth, 'GET', '/account');
    await step(label, auth, 'POST', '/logout');
  },

  // Window shopper that trips a 500 and a 404.
  async browser(label, auth) {
    await step(label, auth, 'GET', '/catalog');
    await step(label, auth, 'GET', '/catalog/p-1001');
    await step(label, auth, 'GET', '/catalog/p-9999'); // 404
    await step(label, auth, 'GET', '/catalog/p-broken'); // 500
    await step(label, auth, 'POST', '/logout');
  },

  // Adds to cart but never checks out.
  async abandoner(label, auth) {
    await step(label, auth, 'GET', '/catalog');
    await step(label, auth, 'GET', '/catalog/p-1004');
    await step(label, auth, 'POST', '/cart/items', { productId: 'p-1004', qty: 1 });
    await step(label, auth, 'GET', '/cart');
    await step(label, auth, 'POST', '/logout');
  },

  // Customer who pokes an admin route and gets a 403.
  async forbidden(label, auth) {
    await step(label, auth, 'GET', '/catalog');
    await step(label, auth, 'GET', '/admin/metrics'); // 403
    await step(label, auth, 'GET', '/account');
    await step(label, auth, 'POST', '/logout');
  },

  // Operator using HTTP Basic.
  async admin(label, auth) {
    await step(label, auth, 'GET', '/admin/metrics');
    await step(label, auth, 'GET', '/catalog');
    await step(label, auth, 'GET', '/orders/o-1000'); // 404 unless created yet
    await step(label, auth, 'GET', '/account');
  },

  // Support agent looking things up.
  async support(label, auth) {
    await step(label, auth, 'GET', '/account');
    await step(label, auth, 'GET', '/catalog');
    await step(label, auth, 'GET', '/catalog/p-1002');
  },

  // Machine client polling with an API key.
  async service(label, auth) {
    await step(label, auth, 'GET', '/admin/metrics');
    await step(label, auth, 'GET', '/account');
    await step(label, auth, 'GET', '/admin/metrics');
  },

  // Short bulk journeys (kept light so SESSIONS=1000 stays a few thousand reqs).
  async peek(label, auth) {
    await step(label, auth, 'GET', '/catalog');
    await step(label, auth, 'GET', '/catalog/p-1001');
    await step(label, auth, 'POST', '/logout');
  },
  async quick(label, auth) {
    await step(label, auth, 'GET', '/catalog');
    await step(label, auth, 'GET', '/catalog/p-1003');
    await step(label, auth, 'POST', '/cart/items', { productId: 'p-1003', qty: 1 });
    await step(label, auth, 'POST', '/logout');
  },
  async buy(label, auth) {
    await step(label, auth, 'GET', '/catalog');
    await step(label, auth, 'GET', '/catalog/p-1005');
    await step(label, auth, 'POST', '/cart/items', { productId: 'p-1005', qty: 1 });
    await step(label, auth, 'POST', '/orders');
    await step(label, auth, 'POST', '/logout');
  },
};

async function runPersona(p) {
  const label = p.username || p.key;
  const auth = await authHeader(p, label);
  if (!auth) {
    if (VERBOSE) console.log(`  [${label}] could not authenticate; skipping`);
    return;
  }
  await JOURNEYS[p.journey](label, auth);
}

// runPool processes items with at most `concurrency` running at once.
async function runPool(items, worker, concurrency) {
  let idx = 0;
  let done = 0;
  const lanes = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      await worker(items[i]);
      done++;
      if (!VERBOSE && done % 100 === 0) {
        console.log(`  …${done}/${items.length} sessions`);
      }
    }
  });
  await Promise.all(lanes);
}

async function main() {
  const personas = buildPersonas();
  const started = Date.now();
  console.log(`Driving ${personas.length} sessions against ${BASE} (concurrency ${CONCURRENCY}, think<=${THINK_MAX}ms)`);

  // A couple of unauthenticated health checks land in the "unattributed" bucket.
  await request('anonymous', 'GET', '/health');
  await request('anonymous', 'GET', '/health');

  await runPool(personas, runPersona, CONCURRENCY);

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`Done. ${personas.length} sessions, ${totalRequests} requests in ${secs}s.`);
  console.log('Stop the recording to inspect sessions in proxymock web.');
}

main();
