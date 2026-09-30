import { randomUUID } from 'node:crypto'
import { priceForMaturity } from './format.js'

export class CatalogUnavailable extends Error {}

// Client for the hosted CNCF projects API. `fetchImpl` is injectable for tests.
export function createCatalog({ baseUrl, fetchImpl = fetch, timeoutMs = 5000, now = Date.now }) {
  async function get(path) {
    const url = `${baseUrl}${path}?ts=${now()}`
    let res
    try {
      res = await fetchImpl(url, {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': 'tutorial-orders/1',
          'X-Request-Id': randomUUID(),
        },
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (err) {
      throw new CatalogUnavailable(err.message, { cause: err })
    }
    if (res.status === 404) {
      await res.body?.cancel()
      return null
    }
    if (res.status !== 200) {
      await res.body?.cancel()
      throw new CatalogUnavailable(`upstream status ${res.status}`)
    }
    try {
      return await res.json()
    } catch (err) {
      throw new CatalogUnavailable(err.message, { cause: err })
    }
  }

  return {
    // Whole catalog, in upstream order.
    async products() {
      const projects = await get('/v1/projects')
      if (!Array.isArray(projects)) throw new CatalogUnavailable('unexpected catalog shape')
      return projects.map(toProduct)
    },
    // One project, or null when upstream says 404.
    async project(id) {
      const project = await get(`/v1/project/${encodeURIComponent(id)}`)
      if (project === null) return null
      if (typeof project !== 'object' || Array.isArray(project)) {
        throw new CatalogUnavailable('unexpected project shape')
      }
      return toProduct(project)
    },
  }
}

function toProduct(p) {
  return {
    project_id: p.id,
    name: p.name,
    maturity: p.maturity,
    unit_price_cents: priceForMaturity(p.maturity),
  }
}
