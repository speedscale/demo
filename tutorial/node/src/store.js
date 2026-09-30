import pg from 'pg'
import { parseTimestamptz } from './format.js'

// The statements from contract/SPEC.md, character for character.
export const SQL = {
  S1: "INSERT INTO orders (id, customer, status, total_cents) VALUES ($1::uuid, $2, 'placed', $3) RETURNING created_at",
  S2: 'INSERT INTO order_items (order_id, project_id, name, quantity, unit_price_cents) VALUES ($1::uuid, $2, $3, $4, $5)',
  S3: 'SELECT id, customer, status, total_cents, created_at FROM orders WHERE id = $1::uuid',
  S4: 'SELECT project_id, name, quantity, unit_price_cents FROM order_items WHERE order_id = $1::uuid ORDER BY id',
  S5: 'SELECT id, customer, status, total_cents, created_at FROM orders WHERE created_at > $1::timestamptz ORDER BY created_at DESC LIMIT 50',
  S6: 'SELECT o.id, o.customer, o.status, o.total_cents, o.created_at, COUNT(i.id) AS item_count FROM orders o LEFT JOIN order_items i ON i.order_id = o.id WHERE o.created_at > $1::timestamptz GROUP BY o.id ORDER BY o.created_at DESC LIMIT 50',
  S7: 'SELECT status FROM orders WHERE id = $1::uuid',
}

const TIMESTAMPTZ_OID = 1184

// pg Pool, max 5, unnamed statements only (never pass `name`), timestamptz
// parsed with millisecond truncation.
export function createPool(connectionString) {
  return new pg.Pool({
    connectionString,
    max: 5,
    types: {
      getTypeParser: (oid, format) =>
        oid === TIMESTAMPTZ_OID ? parseTimestamptz : pg.types.getTypeParser(oid, format),
    },
  })
}

// Data access over anything with pg's Pool interface (query, connect).
export function createStore(pool) {
  const items = async (id) => (await pool.query(SQL.S4, [id])).rows

  return {
    // S1 + one S2 per item, in one transaction. Returns created_at.
    async createOrder({ id, customer, total_cents, items: lines }) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const res = await client.query(SQL.S1, [id, customer, total_cents])
        for (const l of lines) {
          await client.query(SQL.S2, [id, l.project_id, l.name, l.quantity, l.unit_price_cents])
        }
        await client.query('COMMIT')
        return res.rows[0].created_at
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        throw err
      } finally {
        client.release()
      }
    },

    // S3 then S4; null when the order does not exist.
    async getOrder(id) {
      const { rows } = await pool.query(SQL.S3, [id])
      if (rows.length === 0) return null
      return { order: rows[0], items: await items(id) }
    },

    // S7; null when the order does not exist.
    async getStatus(id) {
      const { rows } = await pool.query(SQL.S7, [id])
      return rows.length === 0 ? null : rows[0].status
    },

    // Default: S6. Slow (planted N+1): S5, then S4 per returned order.
    async listRecent(cutoff, slow) {
      const param = cutoff.toISOString()
      if (!slow) {
        const { rows } = await pool.query(SQL.S6, [param])
        return rows.map((r) => ({ ...r, item_count: Number(r.item_count) }))
      }
      const { rows } = await pool.query(SQL.S5, [param])
      const out = []
      for (const r of rows) out.push({ ...r, item_count: (await items(r.id)).length })
      return out
    },
  }
}
