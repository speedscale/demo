import { randomUUID } from 'node:crypto'
import express from 'express'
import { CatalogUnavailable } from './catalog.js'
import { formatTimestamp, listView, orderView } from './format.js'
import { MSG, validateOrder } from './validate.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HOUR_MS = 60 * 60 * 1000

// Compact JSON with the exact Content-Type from the contract (no charset),
// written straight to the response so Express adds nothing.
function send(res, status, body) {
  const text = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(text),
  })
  res.end(text)
}

const fail = (res, status, message) => send(res, status, { error: message })

// Builds the Express app. store, catalog and clock are injected so tests need
// neither Postgres nor the network.
export function createApp({ store, catalog, version = 'v1', slow = false, clock = () => new Date() }) {
  const app = express()
  app.disable('x-powered-by')
  app.set('etag', false)
  // Every content type is parsed as JSON; an empty body is not a JSON object.
  app.use(
    express.json({
      type: () => true,
      verify: (req, res, buf) => {
        if (buf.length === 0) throw Object.assign(new Error('empty body'), { status: 400, type: 'entity.parse.failed' })
      },
    }),
  )

  // Wrap async handlers so a rejection reaches the error handler.
  const route = (fn) => (req, res, next) => fn(req, res).catch(next)

  app.get('/healthz', (req, res) => send(res, 200, { status: 'ok' }))

  app.get('/catalog', route(async (req, res) => {
    const products = await catalog.products()
    send(res, 200, { products, generated_at: formatTimestamp(clock()) })
  }))

  app.post('/orders', route(async (req, res) => {
    const invalid = validateOrder(req.body)
    if (invalid) return fail(res, 400, invalid)
    const { customer, items } = req.body

    const lines = []
    for (const item of items) {
      const project = await catalog.project(item.project_id)
      if (project === null) return fail(res, 422, `unknown project: ${item.project_id}`)
      lines.push({
        project_id: item.project_id,
        name: project.name,
        quantity: item.quantity,
        unit_price_cents: project.unit_price_cents,
      })
    }

    const id = randomUUID()
    const total_cents = lines.reduce((sum, l) => sum + l.quantity * l.unit_price_cents, 0)
    const created_at = await store.createOrder({ id, customer, total_cents, items: lines })
    const order = { id, customer, status: 'placed', total_cents, created_at }
    send(res, 201, orderView({ order, items: lines, version, now: clock() }))
  }))

  app.get('/orders/:id/status', route(async (req, res) => {
    const id = req.params.id.toLowerCase()
    if (!UUID.test(id)) return fail(res, 404, 'order not found')
    const status = await store.getStatus(id)
    if (status === null) return fail(res, 404, 'order not found')
    send(res, 200, { id, status, generated_at: formatTimestamp(clock()) })
  }))

  app.get('/orders/:id', route(async (req, res) => {
    const { id } = req.params
    if (!UUID.test(id)) return fail(res, 404, 'order not found')
    const found = await store.getOrder(id)
    if (found === null) return fail(res, 404, 'order not found')
    send(res, 200, orderView({ ...found, version, now: clock() }))
  }))

  app.get('/orders', route(async (req, res) => {
    const cutoff = new Date(clock().getTime() - HOUR_MS)
    const orders = await store.listRecent(cutoff, slow)
    send(res, 200, listView({ orders, version, now: clock() }))
  }))

  app.use((req, res) => fail(res, 404, 'not found'))

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    // body-parser errors (malformed or oversized JSON) carry a 4xx status.
    if (err.status >= 400 && err.status < 500 && err.type) return fail(res, 400, MSG.json)
    if (err instanceof CatalogUnavailable) return fail(res, 502, 'catalog unavailable')
    console.error(err)
    fail(res, 500, 'internal error')
  })

  return app
}
