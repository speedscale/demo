import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  formatTimestamp,
  listView,
  orderView,
  parseTimestamptz,
  priceForMaturity,
  renderTotal,
} from '../src/format.js'
import { MSG, validateOrder } from '../src/validate.js'

const item = (over = {}) => ({ project_id: 'kubernetes', quantity: 2, ...over })
const valid = (over = {}) => ({ customer: 'ada@example.com', items: [item()], ...over })

test('validation messages, in contract order', () => {
  assert.equal(validateOrder(valid()), null)
  for (const body of [null, undefined, [], 'x', 7]) assert.equal(validateOrder(body), MSG.json)
  for (const customer of [undefined, '', 5, null]) {
    assert.equal(validateOrder(valid({ customer })), 'customer is required')
  }
  const tooMany = Array.from({ length: 11 }, () => item())
  for (const items of [undefined, [], 'x', {}, tooMany]) {
    assert.equal(validateOrder(valid({ items })), 'items must have 1 to 10 entries')
  }
  assert.equal(validateOrder(valid({ items: Array.from({ length: 10 }, () => item()) })), null)
  for (const project_id of [undefined, '', 3]) {
    assert.equal(validateOrder(valid({ items: [item({ project_id })] })), 'project_id is required')
  }
  for (const quantity of [undefined, 0, 100, 1.5, '2', null, -1]) {
    assert.equal(
      validateOrder(valid({ items: [item({ quantity })] })),
      'quantity must be between 1 and 99',
    )
  }
  assert.equal(validateOrder(valid({ items: [item({ quantity: 1 }), item({ quantity: 99 })] })), null)
})

test('validation checks customer before items, and items before entries', () => {
  assert.equal(validateOrder({ items: [] }), 'customer is required')
  assert.equal(validateOrder({ customer: 'a', items: [item({ project_id: '', quantity: 0 })] }), 'project_id is required')
})

test('pricing by maturity', () => {
  assert.equal(priceForMaturity('Graduated'), 1200)
  assert.equal(priceForMaturity('Incubating'), 800)
  assert.equal(priceForMaturity('Sandbox'), 500)
  for (const other of ['Archived', '', undefined, null, 'toString']) {
    assert.equal(priceForMaturity(other), 1000)
  }
})

test('timestamp format is UTC with exactly three fractional digits', () => {
  assert.equal(formatTimestamp(new Date('2026-09-30T10:44:50.123Z')), '2026-09-30T10:44:50.123Z')
  assert.equal(formatTimestamp(new Date('2026-09-30T10:44:50Z')), '2026-09-30T10:44:50.000Z')
  assert.match(formatTimestamp(new Date()), /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
})

test('postgres timestamptz text truncates to milliseconds and honours the offset', () => {
  const t = (s) => formatTimestamp(parseTimestamptz(s))
  assert.equal(t('2026-09-30 10:53:23.074999+00'), '2026-09-30T10:53:23.074Z')
  assert.equal(t('2026-09-30 10:53:23.999999+00'), '2026-09-30T10:53:23.999Z')
  assert.equal(t('2026-09-30 10:53:23.5+00'), '2026-09-30T10:53:23.500Z')
  assert.equal(t('2026-09-30 10:53:23+00'), '2026-09-30T10:53:23.000Z')
  assert.equal(t('2026-09-30 03:53:23.074146-07'), '2026-09-30T10:53:23.074Z')
  assert.equal(t('2026-09-30 16:23:23.1+05:30'), '2026-09-30T10:53:23.100Z')
})

const order = { id: 'abc', customer: 'ada@example.com', status: 'placed', total_cents: 2400, created_at: new Date('2026-09-30T10:00:00.001Z') }
const items = [{ project_id: 'kubernetes', name: 'Kubernetes', quantity: 2, unit_price_cents: 1200, extra: 'dropped' }]
const now = new Date('2026-09-30T10:00:01.002Z')

test('order object keys are in contract order and serialize compactly', () => {
  const view = orderView({ order, items, version: 'v1', now })
  assert.deepEqual(Object.keys(view), ['id', 'customer', 'status', 'items', 'total_cents', 'created_at', 'generated_at'])
  assert.deepEqual(Object.keys(view.items[0]), ['project_id', 'name', 'quantity', 'unit_price_cents'])
  assert.equal(
    JSON.stringify(view),
    '{"id":"abc","customer":"ada@example.com","status":"placed","items":[{"project_id":"kubernetes","name":"Kubernetes","quantity":2,"unit_price_cents":1200}],"total_cents":2400,"created_at":"2026-09-30T10:00:00.001Z","generated_at":"2026-09-30T10:00:01.002Z"}',
  )
})

test('list keys are in contract order', () => {
  const view = listView({ orders: [{ ...order, item_count: 1 }], version: 'v1', now })
  assert.deepEqual(Object.keys(view), ['orders', 'generated_at'])
  assert.deepEqual(Object.keys(view.orders[0]), ['id', 'customer', 'status', 'item_count', 'total_cents', 'created_at'])
})

test('v2 renders total_cents as a string in the order object and the list', () => {
  assert.equal(renderTotal('v1', 2400), 2400)
  assert.equal(renderTotal('v2', 2400), '2400')
  assert.equal(orderView({ order, items, version: 'v2', now }).total_cents, '2400')
  const list = listView({ orders: [{ ...order, item_count: 1 }], version: 'v2', now })
  assert.equal(list.orders[0].total_cents, '2400')
  assert.equal(list.orders[0].item_count, 1)
})
