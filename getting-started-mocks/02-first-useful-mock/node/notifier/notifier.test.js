import assert from 'node:assert/strict'
import test from 'node:test'

import { Notifier } from './notifier.js'

test('creates a notification when the package is delayed', async () => {
  const delayed = async () => 'delayed'
  const notifier = new Notifier(delayed)

  assert.equal(await notifier.notify('TRACK-123'), 'Package TRACK-123 is delayed')
})

test('creates no notification when the package is delivered', async () => {
  const delivered = async () => 'delivered'
  const notifier = new Notifier(delivered)

  assert.equal(await notifier.notify('TRACK-123'), null)
})
