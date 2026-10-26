// GraphQL demo, Node.js edition. The same API and driver as the Go version in
// the parent directory: same schema, same resolvers, and a driver that sends
// byte-for-byte the same requests, so every proxymock walkthrough runs
// unchanged against either one.
//
// The server is built on graphql-js, the GraphQL reference implementation,
// with the schema defined in code. It parses and validates every incoming
// query, so a transform that mangles a query produces a visible GraphQL error
// on replay.
//
// Run the server:            node graphql-demo.js
// Exercise it once:          node graphql-demo.js -drive
// Continuous traffic:        node graphql-demo.js -drive -loop
// Through proxymock (:4143): node graphql-demo.js -drive -target http://localhost:4143

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import {
  GraphQLBoolean,
  GraphQLInputObjectType,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  GraphQLUnionType,
  graphql,
} from 'graphql'

// jwtSecret signs and verifies the demo session tokens. It is deliberately a
// fixed, published value so a jwt_resign transform can be configured against
// it without any secret management.
const jwtSecret = 'speedscale-demo-secret'

// tokenTTL keeps recorded sessions short-lived on purpose: replay a recording
// more than five minutes after capture and the Session query fails with
// "token expired" until a transform regenerates or re-signs the token.
const tokenTTLSeconds = 5 * 60

function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.drive) {
    runDriver(args.target, args.loop, args.intervalMs).catch((err) => fatal(err.message))
    return
  }
  runServer()
}

// parseArgs accepts the Go version's flags (-drive, -target URL, -loop,
// -interval 2s) so the two are interchangeable in scripts and docs.
function parseArgs(argv) {
  const args = { drive: false, target: 'http://localhost:8080', loop: false, intervalMs: 2000 }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i].replace(/^--?/, '')
    if (flag === 'drive') args.drive = true
    else if (flag === 'loop') args.loop = true
    else if (flag === 'target') args.target = argv[++i]
    else if (flag === 'interval') args.intervalMs = parseInt(argv[++i], 10) * 1000
    else fatal(`unknown flag ${argv[i]}`)
  }
  return args
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

function runServer() {
  const schema = buildSchema()
  const server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname
    try {
      if (req.method === 'POST' && path === '/graphql') {
        await handleGraphQL(schema, req, res)
      } else if (req.method === 'POST' && path === '/api/search') {
        await handleRESTSearch(req, res)
      } else if (req.method === 'GET' && path === '/health') {
        writeJSON(res, 200, { status: 'ok' })
      } else {
        writeJSON(res, 404, { error: 'not found' })
      }
    } catch (err) {
      writeJSON(res, 500, { errors: [{ message: err.message }] })
    }
  })
  const port = process.env.PORT || '8080'
  server.listen(port, () => log(`graphql-demo serving on :${port} (POST /graphql)`))
}

async function handleGraphQL(schema, req, res) {
  let body
  try {
    body = JSON.parse(await readBody(req))
  } catch {
    writeJSON(res, 400, { errors: [{ message: 'body is not valid JSON' }] })
    return
  }

  // APQ negative case: hash but no query text. Real servers answer
  // PersistedQueryNotFound on a cache miss; so does this one. The point for
  // Speedscale is that there is no query text to convert or edit.
  if (!body.query) {
    if (body.extensions?.persistedQuery) {
      writeJSON(res, 200, {
        errors: [{ message: 'PersistedQueryNotFound', extensions: { code: 'PERSISTED_QUERY_NOT_FOUND' } }],
      })
      return
    }
    writeJSON(res, 400, { errors: [{ message: 'no query provided' }] })
    return
  }

  const result = await graphql({
    schema,
    source: body.query,
    variableValues: body.variables,
    operationName: body.operationName || undefined,
  })
  if (result.errors?.length) {
    log(`graphql op=${JSON.stringify(body.operationName ?? '')} errors=${result.errors.map((e) => e.message).join('; ')}`)
  } else {
    log(`graphql op=${JSON.stringify(body.operationName ?? '')} ok`)
  }
  // Per GraphQL-over-HTTP convention, execution and validation errors ride
  // in the 200 envelope's errors array.
  writeJSON(res, 200, result)
}

// handleRESTSearch is the fake-GraphQL negative case: a plain REST endpoint
// whose body happens to have a top-level "query" key. It lives at /api/search
// so URL-suffix GraphQL detection must ignore it.
async function handleRESTSearch(req, res) {
  let body
  try {
    body = JSON.parse(await readBody(req))
  } catch {
    body = {}
  }
  if (!body.query) {
    writeJSON(res, 400, { error: 'expected {"query": "..."}' })
    return
  }
  const limit = body.limit > 0 ? body.limit : 3
  const results = []
  for (let i = 0; i < limit; i++) {
    results.push({ rank: i + 1, title: `result ${i + 1} for ${JSON.stringify(body.query)}` })
  }
  writeJSON(res, 200, { query: body.query, results })
}

// buildSchema defines a small SaaS-flavored schema: users, plans, sessions,
// a search union, and an event sink whose payload argument is a JSON string.
function buildSchema() {
  const planType = new GraphQLObjectType({
    name: 'Plan',
    fields: {
      name: { type: new GraphQLNonNull(GraphQLString) },
      price: { type: new GraphQLNonNull(GraphQLInt) },
    },
  })
  const userType = new GraphQLObjectType({
    name: 'User',
    fields: {
      id: { type: new GraphQLNonNull(GraphQLString) },
      email: { type: new GraphQLNonNull(GraphQLString) },
      plan: { type: GraphQLString },
      tags: { type: new GraphQLList(GraphQLString) },
    },
  })
  const sessionType = new GraphQLObjectType({
    name: 'Session',
    fields: {
      userId: { type: new GraphQLNonNull(GraphQLString) },
      expiresAt: { type: new GraphQLNonNull(GraphQLString) },
      requestId: { type: GraphQLString },
    },
  })
  const eventType = new GraphQLObjectType({
    name: 'Event',
    fields: {
      accepted: { type: new GraphQLNonNull(GraphQLBoolean) },
      action: { type: GraphQLString },
    },
  })
  const searchResultType = new GraphQLUnionType({
    name: 'SearchResult',
    types: [userType, planType],
    resolveType: (value) => ('email' in value ? 'User' : 'Plan'),
  })
  const createUserInput = new GraphQLInputObjectType({
    name: 'CreateUserInput',
    fields: {
      email: { type: new GraphQLNonNull(GraphQLString) },
      plan: { type: GraphQLString },
      tags: { type: new GraphQLList(GraphQLString) },
    },
  })

  const plans = [
    { name: 'free', price: 0 },
    { name: 'pro', price: 49 },
    { name: 'enterprise', price: 499 },
  ]
  // Responses derive deterministically from inputs so recorded and replayed
  // traffic stay comparable; the volatility in this demo lives in the
  // REQUESTS (tokens, emails, request ids), which is where transforms work.
  const userByID = (id) => ({
    id,
    email: `${id}@example.com`,
    plan: plans[id.length % plans.length].name,
    tags: ['seed'],
  })

  const queryType = new GraphQLObjectType({
    name: 'Query',
    fields: {
      user: {
        type: userType,
        args: { id: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: (_, { id }) => userByID(id),
      },
      plans: {
        type: new GraphQLList(planType),
        resolve: () => plans,
      },
      search: {
        type: new GraphQLList(searchResultType),
        args: { q: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: (_, { q }) => [userByID(`u-${q}`), ...plans.filter((p) => p.name.includes(q))],
      },
      // session VERIFIES the JWT: bad signature or an expired token is a
      // GraphQL error. This is what makes token transforms provable: stale
      // recordings fail here until jwt_resign fixes the variable.
      session: {
        type: sessionType,
        args: {
          token: { type: new GraphQLNonNull(GraphQLString) },
          requestId: { type: GraphQLString },
        },
        resolve: (_, { token, requestId }) => {
          const claims = verifyJWT(token)
          const session = {
            userId: claims.sub,
            expiresAt: new Date(claims.exp * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
          }
          if (typeof requestId === 'string') session.requestId = requestId
          return session
        },
      },
    },
  })

  const mutationType = new GraphQLObjectType({
    name: 'Mutation',
    fields: {
      createUser: {
        type: userType,
        args: { input: { type: new GraphQLNonNull(createUserInput) } },
        resolve: (_, { input }) => ({
          id: `u-${createHash('sha256').update(input.email).digest('hex').slice(0, 8)}`,
          email: input.email,
          plan: input.plan ?? null,
          tags: input.tags ?? null,
        }),
      },
      // trackEvent's payload is a JSON document serialized into a string
      // argument, the case that needs graphql -> json_path chaining. The
      // server parses it to prove it is real JSON.
      trackEvent: {
        type: eventType,
        args: { payload: { type: new GraphQLNonNull(GraphQLString) } },
        resolve: (_, { payload }) => {
          let parsed
          try {
            parsed = JSON.parse(payload)
          } catch (err) {
            throw new Error(`payload is not valid JSON: ${err.message}`)
          }
          return { accepted: true, action: parsed.action ?? null }
        },
      },
    },
  })

  return new GraphQLSchema({ query: queryType, mutation: mutationType })
}

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

// The GraphQL documents the driver sends. Fixed text, so recordings are
// stable; the per-run values ride in variables (and one inline literal).
const docSession = `query Session($token: String!, $requestId: String!) {
  session(token: $token, requestId: $requestId) {
    userId
    expiresAt
    requestId
  }
}`

const docCreateUser = `mutation CreateUser($email: String!) {
  createUser(input: {email: $email, plan: "pro", tags: ["beta", "early-access"]}) {
    id
    email
    plan
    __typename
  }
}`

const docDashboard = `query Dashboard {
  me: user(id: "u-1") {
    ...UserFields
  }
  teammate: user(id: "u-2") {
    ...UserFields
  }
}

fragment UserFields on User {
  id
  email
  plan
  __typename
}`

const docFind = `query Find($q: String!) {
  search(q: $q) {
    __typename
    ... on User {
      id
      email
    }
    ... on Plan {
      name
      price
    }
  }
}`

const docMultiOp = `query GetPlans {
  plans {
    name
    price
  }
}

query GetUser {
  user(id: "u-1") {
    id
    email
  }
}`

const docTrack = `mutation Track {
  trackEvent(payload: "{\\"action\\":\\"login\\",\\"attempt\\":3,\\"client\\":{\\"os\\":\\"macos\\",\\"version\\":\\"2.1.0\\"}}") {
    accepted
    action
  }
}`

async function runDriver(target, loop, intervalMs) {
  for (let pass = 1; ; pass++) {
    try {
      await drivePass(target, pass)
    } catch (err) {
      fatal(`pass ${pass}: ${err.message}`)
    }
    if (!loop) return
    await new Promise((resolve) => setTimeout(resolve, intervalMs))
  }
}

// gqlRequest builds the same envelope the Go driver sends, including the
// null fields, so recordings from either driver are interchangeable.
function gqlRequest({ query = '', operationName = '', variables = null, extensions = null }) {
  return { query, operationName, variables, extensions }
}

async function drivePass(target, pass) {
  const requestId = randomHex(16)
  const email = `user-${randomHex(4)}@example.com`
  const token = signJWT(`u-${randomHex(4)}`, tokenTTLSeconds)

  const cases = [
    ['Session', gqlRequest({ query: docSession, operationName: 'Session', variables: { requestId, token } })],
    ['CreateUser', gqlRequest({ query: docCreateUser, operationName: 'CreateUser', variables: { email } })],
    ['Dashboard', gqlRequest({ query: docDashboard, operationName: 'Dashboard' })],
    ['Find', gqlRequest({ query: docFind, operationName: 'Find', variables: { q: 'pro' } })],
    ['GetPlans', gqlRequest({ query: docMultiOp, operationName: 'GetPlans' })],
    ['GetUser', gqlRequest({ query: docMultiOp, operationName: 'GetUser' })],
    ['Track', gqlRequest({ query: docTrack, operationName: 'Track' })],
  ]
  for (const [name, req] of cases) {
    await postGraphQL(target, name, req, false)
  }

  // Negative case: APQ hash with no query text. The expected answer is the
  // PersistedQueryNotFound error, so errors are required here.
  const apq = gqlRequest({
    extensions: { persistedQuery: { sha256Hash: createHash('sha256').update(docSession).digest('hex'), version: 1 } },
  })
  await postGraphQL(target, 'APQ', apq, true)

  // Negative case: REST search whose body merely looks GraphQL-ish.
  await postRESTSearch(target)

  log(`pass ${pass} complete: 7 GraphQL operations + APQ + REST negative`)
}

async function postGraphQL(target, name, req, wantErrors) {
  let resp
  try {
    resp = await fetch(`${target}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    })
  } catch (err) {
    throw new Error(`${name}: ${err.cause?.message ?? err.message}`)
  }
  let out
  try {
    out = await resp.json()
  } catch (err) {
    throw new Error(`${name}: decoding response: ${err.message}`)
  }
  const errors = out.errors ?? []
  if (wantErrors) {
    if (!errors.length) throw new Error(`${name}: expected a GraphQL error, got none`)
    log(`${name.padEnd(10)} ok (expected error: ${errors[0].message})`)
    return
  }
  if (errors.length) throw new Error(`${name}: unexpected errors: ${JSON.stringify(errors)}`)
  log(`${name.padEnd(10)} ok`)
}

async function postRESTSearch(target) {
  let resp
  try {
    resp = await fetch(`${target}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"query": "error rates by service", "limit": 2}',
    })
  } catch (err) {
    throw new Error(`rest search: ${err.cause?.message ?? err.message}`)
  }
  if (resp.status !== 200) throw new Error(`rest search: status ${resp.status}`)
  log(`${'RESTSearch'.padEnd(10)} ok`)
}

// ---------------------------------------------------------------------------
// Minimal HS256 JWT: no dependency, fixed demo secret
// ---------------------------------------------------------------------------

function signJWT(sub, ttlSeconds) {
  const now = Math.floor(Date.now() / 1000)
  const header = b64url(Buffer.from('{"alg":"HS256","typ":"JWT"}'))
  const claims = b64url(Buffer.from(JSON.stringify({ exp: now + ttlSeconds, iat: now, sub })))
  const signingInput = `${header}.${claims}`
  return `${signingInput}.${b64url(createHmac('sha256', jwtSecret).update(signingInput).digest())}`
}

function verifyJWT(token) {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('token is not a JWT')
  const want = Buffer.from(b64url(createHmac('sha256', jwtSecret).update(`${parts[0]}.${parts[1]}`).digest()))
  const got = Buffer.from(parts[2])
  if (want.length !== got.length || !timingSafeEqual(want, got)) throw new Error('token signature invalid')
  let claims
  try {
    claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString())
  } catch {
    throw new Error('token claims not JSON')
  }
  if (typeof claims.exp !== 'number' || Math.floor(Date.now() / 1000) > claims.exp) {
    throw new Error('token expired')
  }
  return claims
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString()))
    req.on('error', reject)
  })
}

function writeJSON(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(`${JSON.stringify(payload)}\n`)
}

function b64url(buf) {
  return buf.toString('base64url')
}

function randomHex(n) {
  return randomBytes(n).toString('hex')
}

// log matches Go's log package format (2006/01/02 15:04:05) so driver output
// reads the same in every language.
function log(msg) {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  console.log(`${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())} ${msg}`)
}

function fatal(msg) {
  log(msg)
  process.exit(1)
}

main()
