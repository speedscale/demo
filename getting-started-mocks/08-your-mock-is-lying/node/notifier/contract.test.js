import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { CarrierClient } from './carrier.js'

const enabled = process.env.CARRIER_CONTRACT_TEST === '1'

test('live carrier still matches the captured shape', { skip: !enabled }, async () => {
  const baseUrl = required('CARRIER_URL').replace(/\/+$/, '')
  const apiKey = required('CARRIER_API_KEY')
  const trackingNumber = required('CARRIER_TRACKING_NUMBER')

  await new CarrierClient(baseUrl, apiKey).lookup(trackingNumber)
  const response = await fetch(`${baseUrl}/shipments/${encodeURIComponent(trackingNumber)}`, {
    headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
  })
  const live = await response.json()
  const captured = JSON.parse(
    await readFile(new URL('../../fixtures/carrier-shipment-delayed.json', import.meta.url), 'utf8'),
  )
  for (const field of Object.keys(captured)) {
    assert.ok(Object.hasOwn(live, field), `live response is missing captured field ${field}`)
  }
})

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}
