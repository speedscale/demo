import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createApp } from '../src/app.js'
import { CatalogUnavailable, createCatalog } from '../src/catalog.js'
import { SQL, createStore } from '../src/store.js'

const PROJECTS = {
  kubernetes: { project_id: 'kubernetes', name: 'Kubernetes', unit_price_cents: 1200 },
  helm: { project_id: 'helm', name: 'Helm', unit_price_cents: 800 },
}
const created = []
const catalogCalls = []
const fakeCatalog = {
  async products() {
    return Object.values(PROJECTS).map((p) => ({ ...p, maturity: 'Graduated' }))
  },
  async project(id) {
    catalogCalls.push(id)
    if (id === 'down') throw new CatalogUnavailable('boom')
    return PROJECTS[id] ?? null
  },
}
const fakeStore = {
  async createOrder(o) {
    created.push(o)
    return new Date('2026-09-30T10:00:00.123Z')
  },
  async getOrder() {
    return null
  },
  async getStatus() {
    return null
  },
  async listRecent() {
    return []
  },
}

let server
let base
before(async () => {
  const app = createApp({
    store: fakeStore,
    catalog: fakeCatalog,
    clock: () => new Date('2026-09-30T10:00:01.500Z'),
  })
  server = app.listen(0, '127.0.0.1')
  await new Promise((resolve) => server.once('listening', resolve))
  base = `http://127.0.0.1:${server.address().port}`
})
after(() => {
  server.closeAllConnections()
  server.close()
})

const post = (body, headers = { 'Content-Type': 'application/json' }) =>
  fetch(`${base}/orders`, { method: 'POST', headers, body })

test('healthz', async () => {
  const res = await fetch(`${base}/healthz`)
  assert.equal(res.status, 200)
  assert.equal(res.headers.get('content-type'), 'application/json')
  assert.equal(await res.text(), '{"status":"ok"}')
})

test('unknown path and malformed JSON use the contract errors', async () => {
  const nf = await fetch(`${base}/nope`)
  assert.equal(nf.status, 404)
  assert.equal(await nf.text(), '{"error":"not found"}')
  for (const body of ['{bad', '"str"', '[]', '', 'null']) {
    const res = await post(body)
    assert.equal(res.status, 400, body)
    assert.equal(await res.text(), '{"error":"invalid JSON body"}', body)
  }
})

test('validation errors are 400 and never reach the catalog', async () => {
  catalogCalls.length = 0
  const res = await post(JSON.stringify({ customer: 'a', items: [{ project_id: 'kubernetes', quantity: 0 }] }))
  assert.equal(res.status, 400)
  assert.equal(await res.text(), '{"error":"quantity must be between 1 and 99"}')
  assert.deepEqual(catalogCalls, [])
})

test('POST /orders prices lines, totals them, and writes once', async () => {
  created.length = 0
  catalogCalls.length = 0
  const res = await post(
    JSON.stringify({
      customer: 'ada@example.com',
      items: [
        { project_id: 'kubernetes', quantity: 2 },
        { project_id: 'kubernetes', quantity: 1 },
        { project_id: 'helm', quantity: 3 },
      ],
    }),
  )
  assert.equal(res.status, 201)
  const body = await res.json()
  assert.deepEqual(Object.keys(body), ['id', 'customer', 'status', 'items', 'total_cents', 'created_at', 'generated_at'])
  assert.equal(body.total_cents, 2 * 1200 + 1200 + 3 * 800)
  assert.equal(body.created_at, '2026-09-30T10:00:00.123Z')
  assert.equal(body.generated_at, '2026-09-30T10:00:01.500Z')
  assert.match(body.id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  // one upstream call per item, in order, even for a repeated project
  assert.deepEqual(catalogCalls, ['kubernetes', 'kubernetes', 'helm'])
  assert.equal(created.length, 1)
  assert.equal(created[0].items.length, 3)
})

test('unknown project is 422 and nothing is written', async () => {
  created.length = 0
  const res = await post(
    JSON.stringify({ customer: 'a', items: [{ project_id: 'kubernetes', quantity: 1 }, { project_id: 'nope', quantity: 1 }] }),
  )
  assert.equal(res.status, 422)
  assert.equal(await res.text(), '{"error":"unknown project: nope"}')
  assert.equal(created.length, 0)
})

test('catalog failure is 502', async () => {
  const res = await post(JSON.stringify({ customer: 'a', items: [{ project_id: 'down', quantity: 1 }] }))
  assert.equal(res.status, 502)
  assert.equal(await res.text(), '{"error":"catalog unavailable"}')
})

test('invalid UUIDs and missing orders are 404 order not found', async () => {
  for (const path of ['/orders/not-a-uuid', '/orders/not-a-uuid/status', '/orders/00000000-0000-4000-8000-000000000000', '/orders/00000000-0000-4000-8000-000000000000/status']) {
    const res = await fetch(`${base}${path}`)
    assert.equal(res.status, 404, path)
    assert.equal(await res.text(), '{"error":"order not found"}', path)
  }
})

test('catalog client sends the contract headers and maps statuses', async () => {
  const seen = []
  const respond = (status, body) => async (url, init) => {
    seen.push({ url, init })
    return new Response(body === undefined ? null : JSON.stringify(body), { status })
  }
  const opts = { baseUrl: 'https://api.example', now: () => 1234567890123 }

  const ok = createCatalog({ ...opts, fetchImpl: respond(200, { id: 'k', name: 'K', maturity: 'Sandbox' }) })
  assert.deepEqual(await ok.project('k/x y'), { project_id: 'k', name: 'K', maturity: 'Sandbox', unit_price_cents: 500 })
  assert.equal(seen[0].url, 'https://api.example/v1/project/k%2Fx%20y?ts=1234567890123')
  assert.equal(seen[0].init.method, 'GET')
  assert.equal(seen[0].init.headers.Accept, 'application/json')
  assert.equal(seen[0].init.headers['User-Agent'], 'tutorial-orders/1')
  assert.match(seen[0].init.headers['X-Request-Id'], /^[0-9a-f-]{36}$/)

  assert.equal(await createCatalog({ ...opts, fetchImpl: respond(404) }).project('x'), null)
  await assert.rejects(createCatalog({ ...opts, fetchImpl: respond(500) }).project('x'), CatalogUnavailable)
  await assert.rejects(
    createCatalog({ ...opts, fetchImpl: async () => { throw new Error('econnreset') } }).products(),
    CatalogUnavailable,
  )
})

test('store uses the SPEC statements, unnamed, in one transaction', async () => {
  const log = []
  const query = async (text, params) => {
    log.push({ text, params })
    return { rows: text === SQL.S1 ? [{ created_at: new Date(0) }] : [] }
  }
  const client = { query, release() { log.push({ text: 'release' }) } }
  const store = createStore({ query, connect: async () => client })
  await store.createOrder({
    id: 'i',
    customer: 'c',
    total_cents: 3,
    items: [{ project_id: 'p', name: 'P', quantity: 1, unit_price_cents: 3 }, { project_id: 'q', name: 'Q', quantity: 1, unit_price_cents: 3 }],
  })
  assert.deepEqual(log.map((l) => l.text), ['BEGIN', SQL.S1, SQL.S2, SQL.S2, 'COMMIT', 'release'])
  assert.ok(log.every((l) => typeof l.text === 'string'), 'never a config object with a name')
})
