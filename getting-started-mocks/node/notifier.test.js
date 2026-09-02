import assert from 'node:assert/strict'
import test from 'node:test'

import { notificationFor } from './notifier.js'

test('creates a notification when the package is delayed', () => {
  const getShipmentStatus = () => 'delayed'

  const message = notificationFor(getShipmentStatus, 'TRACK-123')

  assert.equal(message, 'Package TRACK-123 is delayed')
})

test('creates no notification when the package is delivered', () => {
  const getShipmentStatus = () => 'delivered'

  const message = notificationFor(getShipmentStatus, 'TRACK-123')

  assert.equal(message, null)
})
