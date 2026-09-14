import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { after, before, test } from 'node:test'

import { HttpResponse, http } from 'msw'
import { setupServer } from 'msw/node'

import { CarrierClient } from './carrier.js'
import { Notifier } from './notifier.js'
import { MemoryRecorder } from './recorder.js'

const CARRIER = 'http://carrier.test'
const server = setupServer()

before(() => server.listen({ onUnhandledRequest: 'error' }))
after(() => server.close())

async function assertNotifiedOnce(messages, recorder) {
  assert.deepEqual(messages, ['Package TRACK-123 is delayed'])
  assert.equal(recorder.count, 1)
}

test('same behavior with a function stub', async () => {
  const messages = []
  const recorder = new MemoryRecorder()
  const notifier = new Notifier(
    async () => 'delayed',
    async (_trackingNumber, message) => messages.push(message),
    recorder,
    async () => {},
  )

  await notifier.notify('TRACK-123')

  await assertNotifiedOnce(messages, recorder)
})

test('same behavior with a fake server', async () => {
  const body = JSON.parse(
    await readFile(new URL('../../fixtures/carrier-shipment-delayed.json', import.meta.url), 'utf8'),
  )
  server.use(
    http.get(`${CARRIER}/shipments/:trackingNumber`, () => HttpResponse.json(body)),
  )
  const client = new CarrierClient(CARRIER, 'secret-key')
  const messages = []
  const recorder = new MemoryRecorder()
  const notifier = new Notifier(
    client.lookup.bind(client),
    async (_trackingNumber, message) => messages.push(message),
    recorder,
    async () => {},
  )

  await notifier.notify('TRACK-123')

  await assertNotifiedOnce(messages, recorder)
})
