import assert from 'node:assert/strict'
import test from 'node:test'

import { CarrierUnavailableError, TimeoutError } from './errors.js'
import { Notifier, maxAttempts } from './notifier.js'

// noSleep is the whole reason the sleep seam exists. The retry tests below
// finish instantly instead of waiting for real backoff.
const noSleep = async () => {}

test('creates a notification when the package is delayed', async () => {
  const delayed = async () => 'delayed'
  const notifier = new Notifier(delayed, noSleep)

  assert.equal(await notifier.notify('TRACK-123'), 'Package TRACK-123 is delayed')
})

test('creates no notification when the package is delivered', async () => {
  const delivered = async () => 'delivered'
  const notifier = new Notifier(delivered, noSleep)

  assert.equal(await notifier.notify('TRACK-123'), null)
})

test('reports that the carrier is unavailable', async () => {
  const unavailable = async () => {
    throw new CarrierUnavailableError('carrier returned 500')
  }
  const notifier = new Notifier(unavailable, noSleep)

  await assert.rejects(() => notifier.notify('TRACK-123'), CarrierUnavailableError)
})

test('reports a timeout', async () => {
  const timeout = async () => {
    throw new TimeoutError('carrier did not answer in time')
  }
  const notifier = new Notifier(timeout, noSleep)

  await assert.rejects(() => notifier.notify('TRACK-123'), TimeoutError)
})

test('ignores an unknown status', async () => {
  for (const status of ['', 'in_transit', 'held_at_customs']) {
    const answer = async () => status
    const notifier = new Notifier(answer, noSleep)

    assert.equal(await notifier.notify('TRACK-123'), null, `status ${status}`)
  }
})

test('retries until the carrier answers', async () => {
  let calls = 0
  const flaky = async () => {
    calls++
    if (calls === 1) {
      throw new CarrierUnavailableError('carrier returned 500')
    }
    return 'delayed'
  }
  let sleeps = 0
  const notifier = new Notifier(flaky, async () => {
    sleeps++
  })

  assert.equal(await notifier.notify('TRACK-123'), 'Package TRACK-123 is delayed')
  assert.equal(calls, 2)
  assert.equal(sleeps, 1)
})

test('gives up after the budget', async () => {
  let calls = 0
  const broken = async () => {
    calls++
    throw new CarrierUnavailableError('carrier returned 500')
  }
  const notifier = new Notifier(broken, noSleep)

  await assert.rejects(() => notifier.notify('TRACK-123'), CarrierUnavailableError)
  assert.equal(calls, maxAttempts)
})
