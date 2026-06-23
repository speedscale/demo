/**
 * TransformRecommendations Demo App
 *
 * This Express app demonstrates all five active TransformRecommendation types when you
 * record traffic with `proxymock record`. Each endpoint and its outbound calls produce
 * traffic patterns that the Speedscale analyzer detects and recommends transforms for.
 *
 * Recommendation types triggered:
 *     1. TRANSFORM_RECOMMENDATION_DATETIME        (type 3)
 *     2. TRANSFORM_RECOMMENDATION_JWT_RESIGN      (types 1 & 2)
 *     3. TRANSFORM_RECOMMENDATION_REQUEST_ID      (type 4)
 *     4. TRANSFORM_RECOMMENDATION_DLP             (type 7)
 *     5. TRANSFORM_RECOMMENDATION_DLP_REDACTION   (type 8)
 *
 * Note: SASL_AUTH (type 9) requires real MongoDB traffic and isn't demonstrated here.
 *       See demo/go-mongo or demo/node-mariadb for SASL auth recommendation examples.
 *
 * Record usage:
 *   npm install && PORT=3000 proxymock record -- node index.js
 */

import express from "express";

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT) || 3000;
const INTERNAL_PORT = PORT;

/* ── in-memory token store ────────────────────────── */
const issuedTokens = new Map(); // accessToken -> { username, issuer }

/* ── helpers ──────────────────────────────────────── */

// createFakeJWT builds a JWT-shaped token so the detector's detectJWT path
// recognises it and sets DATA_PATTERN_JWT on the data-token.
function createFakeJWT() {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: "user-123",
    name: "Jane Doe",
    exp: Math.floor(Date.now() / 1000) + 3600
  })).toString("base64url");
  const sig = Buffer.from("fakesignature").toString("base64url");
  return `${header}.${payload}.${sig}`;
}

function randomUUID() {
  return crypto.randomUUID();
}

/* ── trace middleware ─────────────────────────────── */
// Assigns a request ID that attaches to outbound calls.  Inbound
// requests with X-Request-Id trigger IN detection, outbound calls that
// carry the header trigger OUT detection. Both produce REQUEST_ID recommendations.
const TRACE = Symbol("traceId");

function setRequestId(req, res, next) {
  req[TRACE] = req.headers["x-request-id"] || randomUUID();
  res.set("X-Request-Id", req[TRACE]);
  next();
}

app.use(setRequestId);

/* ── /api/report -> DATETIME (type 3) ─────────────── */
// Outbound POST body contains generatedAt with an ISO timestamp. The detector
// recognises DATA_PATTERN_DATETIME in http.req.bodyBase64 and the analyzer emits
// a TRANSFORM_RECOMMENDATION_DATETIME to replace it with "IGNORED".
app.post("/api/report", async (req, res) => {
  const reportName = req.body?.reportName || "weekly-sync";

  try {
    const fetchRes = await fetch(
      `http://localhost:${INTERNAL_PORT}/internal/report`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: reportName,
          generatedAt: new Date().toISOString()
        })
      }
    );
    const data = await fetchRes.json();
    return res.json({ ...data, echoed: true });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

app.post("/internal/report", async (req, res) => {
  const body = req.body;
  return res.json({
    name: body?.name,
    storedAt: new Date().toISOString(),
    id: randomUUID()
  });
});

/* ── /api/auth/token -> Basic auth + JWT_RESIGN (type 1 & 2) ─ */
// POST /api/auth/token accepts Authorization: Basic <credentials> header.
// Any username/password is accepted. Response body contains access_token
// which triggers TRANSFORM_RECOMMENDATION_JWT_RESIGN.
app.post("/api/auth/token", async (req, res) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header. Expected Basic auth." });
  }

  const encoded = authHeader.slice("Basic ".length);
  const decoded = Buffer.from(encoded, "base64").toString("utf-8");
  const separatorIndex = decoded.indexOf(":");
  if (separatorIndex === -1) {
    return res.status(400).json({ error: "Invalid Basic credentials format. Expected username:password." });
  }

  const username = decoded.slice(0, separatorIndex);
  // Parse password but don't enforce specific values for demo purposes

  // Generate a fresh JWT token and store it in memory for later validation
  const accessToken = createFakeJWT();
  issuedTokens.set(accessToken, { username, createdAt: Date.now() });

  return res.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600
  });
});

/* ── /api/auth/validate -> Validate Bearer token ─── */
// POST /api/auth/validate accepts Authorization: Bearer <token> header.
// Returns user info if the token was previously issued by /api/auth/token,
// or returns a 401 error if the token is not recognized.
app.post("/api/auth/validate", async (req, res) => {
  const authHeader = req.headers["authorization"];
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header. Expected Bearer token." });
  }

  const accessToken = authHeader.slice("Bearer ".length);

  if (!issuedTokens.has(accessToken)) {
    return res.status(401).json({
      error: "Invalid or expired access_token. Token was not issued by /api/auth/token.",
      invalid_token: true
    });
  }

  const tokenInfo = issuedTokens.get(accessToken);
  return res.json({
    valid: true,
    username: tokenInfo.username,
    issued_at: tokenInfo.createdAt,
    token_type: "Bearer"
  });
});

// /api/data validates the Bearer token -> outbound call with Authorization header.
app.post("/api/data", async (req, res) => {
  const auth = req.headers["authorization"];
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing authorization header" });
    }

  try {
    const fetchRes = await fetch(
       `http://localhost:${INTERNAL_PORT}/api/auth/validate`,
       {
        method: "POST",
        headers: {
          Authorization: auth,
           "Content-Type": "application/json"
         },
        body: JSON.stringify({ action: "resolve-roles" })
       });
    const outResult = await fetchRes.json();
    return res.status(fetchRes.status).json(outResult);
    } catch (err) {
    return res.status(502).json({ error: err.message });
    }
});

/* ── /api/search -> REQUEST_ID (type 4) ───────────── */
// Inbound call includes X-Request-Id from the downstream caller.
// Outbound POST adds X-Request-Id header to simulate distributed tracing.
app.post("/api/search", async (req, res) => {
  const query = req.body?.query || "default";

  try {
    const fetchRes = await fetch(
      `http://localhost:${INTERNAL_PORT}/internal/query`,
      {
        method: "POST",
        headers: {
          "X-Request-Id": req[TRACE],
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ query })
      }
    );
    const data = await fetchRes.json();
    return res.json({ ...data, searchDone: true });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

app.post("/internal/query", async (req, res) => {
  const body = req.body;
  return res.json({
    results: [{ id: randomUUID(), name: `result-for-${body?.query}` }],
    searchId: req.headers["x-request-id"]
  });
});

/* ── /api/customers -> DLP (type 7) & REDACTION (8) ─ */
// Outbound call to /internal/customer-upsert sends email, phone, credit card,
// and SSN in the request body. discoverPattern recognises these patterns via
// DiscoverPattern():
//    jane.doe@acmecorp.com     -> DATA_PATTERN_EMAIL
//    +14155552671              -> DATA_PATTERN_E164_PHONE_NUMBER
//    4111111111111111          -> DATA_PATTERN_CREDIT_CARD
//    078-05-1120               -> DATA_PATTERN_SSN
app.post("/api/customers", async (req, res) => {
  const customer = req.body || {};

  try {
    const fetchRes = await fetch(
      `http://localhost:${INTERNAL_PORT}/internal/customer-upsert`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: customer.firstName || "Jane",
          lastName: customer.lastName || "Doe",
          email: customer.email || "jane.doe@acmecorp.com",
          phone: customer.phone || "+14155552671",
          ccNumber: customer.ccNumber || "4111111111111111",
          ssn: customer.ssn || "078-05-1120"
        })
      }
    );
    const data = await fetchRes.json();
    return res.json({ ...data, stored: true });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

app.post("/internal/customer-upsert", async (req, res) => {
  const body = req.body;
  return res.json({ ...body, id: randomUUID(), upserted: true });
});

/* ── /api/profile -> DLP in response bodies ───────── */
// GET /api/profile makes an outbound call that returns sensitive data
// patterns in the response JSON. detectBody finds DATA_PATTERN_EMAIL etc.
// in http.res.bodyBase64, triggering DLP recommendations for response redaction.
app.get("/api/profile", async (req, res) => {
  const auth = req.headers["authorization"];
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing authorization header" });
   }

  // Validate the token first
  const validateRes = await fetch(
     `http://localhost:${INTERNAL_PORT}/api/auth/validate`,
     {
      method: "POST",
      headers: {
        Authorization: auth,
         "Content-Type": "application/json"
       }
    });

  if (!validateRes.ok) {
    const body = await validateRes.json();
    return res.status(validateRes.status).json(body);
   }

  try {
    const fetchRes = await fetch(
      `http://localhost:${INTERNAL_PORT}/internal/profile`,
       { headers: { Authorization: auth } }
     );
    const result = await fetchRes.json();
    return res.json(result);
   } catch (err) {
    return res.status(502).json({ error: err.message });
   }
});

app.get("/internal/profile", async (_req, res) => {
  return res.json({
   user_id: randomUUID(),
    email: "jane.doe@acmecorp.com",
    phone: "+14155552671",
    creditCardNumber: "4111111111111111",
    ssn: "078-05-1120",
    name: "Jane Doe"
   });
});


/* ── /api/events -> DATETIME + REQUEST_ID combined ── */
// POST /api/events includes generatedAt (timestamp) and an X-Request-Id header,
// triggering both recommendation types at once.
app.post("/api/events", async (req, res) => {
  const startDate = new Date(Date.now() - 86400000).toISOString();

  try {
    const fetchRes = await fetch(
      `http://localhost:${INTERNAL_PORT}/internal/events`,
      {
        method: "POST",
        headers: {
          "X-Request-Id": req[TRACE],
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ query: { date: startDate } })
      }
    );
    const result = await fetchRes.json();
    return res.json(result);
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
});

app.post("/internal/events", async (req, res) => {
  const body = req.body;
  return res.json({
    events: [{
      id: randomUUID(),
      type: "deployment",
      event: body?.event || "status-update"
    }],
    queryTimestamp: body?.query?.date,
    processedAt: new Date().toISOString(),
    requestTraceId: req.headers["x-request-id"]
  });
});

/* ── health check ─────────────────────────────────── */
app.get("/", (_req, res) => {
  return res.json({ service: "transform-recommendations-demo", ok: true });
});

/* ── start server ──────────────────────────────────── */
const server = app.listen(PORT, () =>
  console.log(`Demo server running on port ${PORT}`)
);

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} is already in use. Stop the other process or run with a free port, e.g. PORT=3001 node index.js`
    );
    process.exit(1);
  }
  console.error(err);
  process.exit(1);
});