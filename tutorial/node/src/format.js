// Pure helpers: timestamps, pricing and the order/list JSON shapes.

const PRICES = { Graduated: 1200, Incubating: 800, Sandbox: 500 }

export function priceForMaturity(maturity) {
  return Object.hasOwn(PRICES, maturity) ? PRICES[maturity] : 1000
}

// RFC 3339 UTC with exactly three fractional digits. Date only holds whole
// milliseconds, so toISOString truncates rather than rounds.
export function formatTimestamp(date) {
  return date.toISOString()
}

const PG_TIMESTAMPTZ = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})(?:\.(\d+))?([+-]\d{2})(?::?(\d{2}))?$/

// Parses the text form of a Postgres timestamptz ("2026-09-30 10:44:50.123456+00")
// into a Date, truncating (not rounding) the fraction to milliseconds. The pg
// driver's own parser can round, so the pool uses this for oid 1184.
export function parseTimestamptz(text) {
  const m = PG_TIMESTAMPTZ.exec(text)
  if (!m) return new Date(text)
  const [, day, time, frac = '', hh, mm = '00'] = m
  const date = new Date(`${day}T${time}${hh}:${mm}`)
  return new Date(date.getTime() + Number(frac.padEnd(3, '0').slice(0, 3)))
}

// v2 is the planted regression: total_cents becomes a string.
export function renderTotal(version, cents) {
  return version === 'v2' ? String(cents) : cents
}

export function orderView({ order, items, version, now }) {
  return {
    id: order.id,
    customer: order.customer,
    status: order.status,
    items: items.map((i) => ({
      project_id: i.project_id,
      name: i.name,
      quantity: i.quantity,
      unit_price_cents: i.unit_price_cents,
    })),
    total_cents: renderTotal(version, order.total_cents),
    created_at: formatTimestamp(order.created_at),
    generated_at: formatTimestamp(now),
  }
}

export function listView({ orders, version, now }) {
  return {
    orders: orders.map((o) => ({
      id: o.id,
      customer: o.customer,
      status: o.status,
      item_count: o.item_count,
      total_cents: renderTotal(version, o.total_cents),
      created_at: formatTimestamp(o.created_at),
    })),
    generated_at: formatTimestamp(now),
  }
}
