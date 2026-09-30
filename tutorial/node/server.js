import { fetch } from 'undici'
import { createApp } from './src/app.js'
import { createCatalog } from './src/catalog.js'
import { installProxyDispatcher } from './src/proxy.js'
import { createPool, createStore } from './src/store.js'

const port = process.env.PORT || '8080'
const version = process.env.APP_VERSION || 'v1'
const slow = process.env.APP_SLOW === '1'
const databaseUrl =
  process.env.DATABASE_URL || 'postgres://tutorial:tutorial@localhost:5432/tutorial?sslmode=disable'
const demoApiUrl = (process.env.DEMO_API_URL || 'https://demo-api.trafficreplay.com').replace(/\/+$/, '')

installProxyDispatcher()

const pool = createPool(databaseUrl)
pool.on('error', (err) => console.error('idle postgres client error:', err.message))

const app = createApp({
  store: createStore(pool),
  catalog: createCatalog({ baseUrl: demoApiUrl, fetchImpl: fetch }),
  version,
  slow,
})

const server = app.listen(Number(port), () => {
  console.log(`tutorial-orders (node) listening on :${port} version=${version} slow=${slow}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => pool.end().finally(() => process.exit(0)))
    server.closeAllConnections()
  })
}
