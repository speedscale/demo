import assert from 'node:assert/strict'
import test from 'node:test'

import { CarrierUnavailableError, TimeoutError } from './errors.js'
import { Notifier, maxAttempts } from './notifier.js'

const noSleep = async () => {}

// spySender remembers every message it was asked to deliver. It answers the
// only question this post cares about: did it actually send?
function spySender() {
  const sent = []
  const send = async (message) => {
    sent.push(message)
  }
  return { sent, send }
}

test('sends one message for a delayed package', async () => {
  const delayed = async () => 'delayed'
  const spy = spySender()
  const notifier = new Notifier(delayed, spy.send, noSleep)

  await notifier.notify('TRACK-123')

  assert.deepEqual(spy.sent, ['Package TRACK-123 is delayed'])
})

test('sends nothing for a delivered package', async () => {
  const delivered = async () => 'delivered'
  const spy = spySender()
  const notifier = new Notifier(delivered, spy.send, noSleep)

  await notifier.notify('TRACK-123')

  assert.deepEqual(spy.sent, [])
})

test('sends nothing when the carrier is unavailable', async () => {
  const unavailable = async () => {
    throw new CarrierUnavailableError('carrier returned 500')
  }
  const spy = spySender()
  const notifier = new Notifier(unavailable, spy.send, noSleep)

  await assert.rejects(() => notifier.notify('TRACK-123'), CarrierUnavailableError)
  assert.deepEqual(spy.sent, [])
})

test('sends nothing on timeout', async () => {
  const timeout = async () => {
    throw new TimeoutError('carrier did not answer in time')
  }
  const spy = spySender()
  const notifier = new Notifier(timeout, spy.send, noSleep)

  await assert.rejects(() => notifier.notify('TRACK-123'), TimeoutError)
  assert.deepEqual(spy.sent, [])
})

test('sends nothing for an unknown status', async () => {
  for (const status of ['', 'in_transit', 'held_at_customs']) {
    const answer = async () => status
    const spy = spySender()
    const notifier = new Notifier(answer, spy.send, noSleep)

    await notifier.notify('TRACK-123')

    assert.deepEqual(spy.sent, [], `status ${status}`)
  }
})

test('retries then sends', async () => {
  let calls = 0
  const flaky = async () => {
    calls++
    if (calls === 1) {
      throw new CarrierUnavailableError('carrier returned 500')
    }
    return 'delayed'
  }
  const spy = spySender()
  const notifier = new Notifier(flaky, spy.send, noSleep)

  await notifier.notify('TRACK-123')

  assert.deepEqual(spy.sent, ['Package TRACK-123 is delayed'])
})

test('gives up after the budget', async () => {
  let calls = 0
  const broken = async () => {
    calls++
    throw new CarrierUnavailableError('carrier returned 500')
  }
  const spy = spySender()
  const notifier = new Notifier(broken, spy.send, noSleep)

  await assert.rejects(() => notifier.notify('TRACK-123'), CarrierUnavailableError)
  assert.equal(calls, maxAttempts)
  assert.deepEqual(spy.sent, [])
})
