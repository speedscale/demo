// Traffic driver: sends the sequence from contract/SPEC.md to a running service.
// Usage: node traffic.mjs [baseURL]   (default http://localhost:8080)
// Uses node:http directly so it never goes through a proxy, even when
// http_proxy/https_proxy are set.
import http from 'node:http'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const base = new URL(process.argv[2] || 'http://localhost:8080')
const trafficFile =
  process.env.TRAFFIC_FILE || fileURLToPath(new URL('../contract/traffic.json', import.meta.url))
const plan = JSON.parse(readFileSync(trafficFile, 'utf8'))

let sent = 0
let unexpected = 0
let failed = false

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? undefined : JSON.stringify(body)
    const headers = { Accept: 'application/json', 'User-Agent': 'tutorial-traffic/1' }
    if (payload !== undefined) {
      headers['Content-Type'] = 'application/json'
      headers['Content-Length'] = Buffer.byteLength(payload)
    }
    const req = http.request(
      {
        protocol: base.protocol,
        hostname: base.hostname,
        port: base.port,
        method,
        path,
        headers,
        agent: false,
        timeout: 10_000,
      },
      (res) => {
        const chunks = []
        res.on('data', (c) => chunks.push(c))
        res.on('end', () => resolve({ status: res.statusCode, text: Buffer.concat(chunks).toString('utf8') }))
      },
    )
    req.on('timeout', () => req.destroy(new Error('timeout after 10s')))
    req.on('error', reject)
    req.end(payload)
  })
}

// Sends one request and checks the status. Returns the response, or null when
// the request failed outright.
async function send(method, path, want, body) {
  sent++
  let res
  try {
    res = await request(method, path, body)
  } catch (err) {
    failed = true
    unexpected++
    console.log(`${method} ${path}: request failed: ${err.message}`)
    return null
  }
  if (res.status !== want) {
    unexpected++
    console.log(`${method} ${path}: got ${res.status}, want ${want}`)
  }
  return res
}

await send('GET', '/healthz', 200)

for (let i = 0; i < plan.catalog_calls; i++) await send('GET', '/catalog', 200)

for (let i = 0; i < plan.order_rounds; i++) {
  const created = await send('POST', '/orders', 201, plan.orders[i % plan.orders.length])
  let id
  try {
    id = JSON.parse(created?.text).id
  } catch {}
  if (!id) {
    if (created && created.status === 201) {
      unexpected++
      console.log('POST /orders: response has no id')
    }
    continue
  }
  await send('GET', `/orders/${id}`, 200)
  await send('GET', `/orders/${id}/status`, 200)
}

for (let i = 0; i < plan.list_calls; i++) await send('GET', '/orders', 200)

for (const bad of plan.bad_requests) await send(bad.method, bad.path, bad.expect, bad.body)

console.log(`sent ${sent} requests, ${unexpected} unexpected`)
process.exit(unexpected > 0 || failed ? 1 : 0)
