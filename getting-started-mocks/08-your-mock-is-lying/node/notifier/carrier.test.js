import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'

import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'

import { CarrierClient } from './carrier.js'
import { CarrierContractError, CarrierUnavailableError } from './errors.js'

const CARRIER = 'http://carrier.test'
const server = setupServer()

async function fixture(name) {
  return readFile(new URL(`../../fixtures/${name}`, import.meta.url), 'utf8')
}

before(() => server.listen({ onUnhandledRequest: 'error' }))
after(() => server.close())

test('sends the tracking number and the API key', async () => {
  let observedRequest
  server.use(
    http.get(`${CARRIER}/shipments/:trackingNumber`, ({ request }) => {
      observedRequest = request
      return HttpResponse.json({ status: 'delayed' })
    }),
  )

  await new CarrierClient(CARRIER, 'secret-key').lookup('TRACK-123')

  assert.ok(new URL(observedRequest.url).pathname.includes('TRACK-123'))
  assert.equal(observedRequest.headers.get('X-API-Key'), 'secret-key')
  assert.equal(observedRequest.headers.get('Accept'), 'application/json')
})

for (const status of ['delayed', 'delivered', 'in_transit', 'lost']) {
  test(`parses the ${status} shipment state`, async () => {
    server.use(
      http.get(`${CARRIER}/shipments/:trackingNumber`, () => HttpResponse.json({ status })),
    )
    assert.equal(await new CarrierClient(CARRIER, 'secret-key').lookup('TRACK-123'), status)
  })
}

test('treats a non-200 as the carrier being unavailable', async () => {
  server.use(
    http.get(`${CARRIER}/shipments/:trackingNumber`, () =>
      HttpResponse.text('upstream is down', { status: 503 }),
    ),
  )

  await assert.rejects(
    () => new CarrierClient(CARRIER, 'secret-key').lookup('TRACK-123'),
    CarrierUnavailableError,
  )
})

test('fails cleanly on malformed JSON', async () => {
  server.use(
    http.get(`${CARRIER}/shipments/:trackingNumber`, () =>
      HttpResponse.text('{"status": ', { headers: { 'Content-Type': 'application/json' } }),
    ),
  )
  await assert.rejects(() => new CarrierClient(CARRIER, 'secret-key').lookup('TRACK-123'), SyntaxError)
})

test('parses the captured fixture', async () => {
  server.use(
    http.get(`${CARRIER}/shipments/:trackingNumber`, async () =>
      HttpResponse.json(JSON.parse(await fixture('carrier-shipment-delayed.json'))),
    ),
  )
  assert.equal(await new CarrierClient(CARRIER, 'secret-key').lookup('TRACK-123'), 'delayed')
})

test('rejects the renamed field', async () => {
  server.use(
    http.get(`${CARRIER}/shipments/:trackingNumber`, async () =>
      HttpResponse.json(JSON.parse(await fixture('carrier-shipment-delayed-v2.json'))),
    ),
  )
  await assert.rejects(
    () => new CarrierClient(CARRIER, 'secret-key').lookup('TRACK-123'),
    (error) => {
      assert.ok(error instanceof CarrierContractError)
      assert.ok(!(error instanceof CarrierUnavailableError))
      return true
    },
  )
})
