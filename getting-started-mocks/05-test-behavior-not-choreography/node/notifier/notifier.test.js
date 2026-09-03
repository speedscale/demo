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

// Kept on purpose as the cautionary example in this post. It passed until the
// backoff became exponential. Nothing a customer can observe changed: the
// carrier is still asked three times, nothing is still sent, and the same error
// still surfaces. The test broke because it pinned how long the notifier waits
// between attempts, which is choreography, not behavior.
test(
  'give-up choreography',
  { skip: 'over-specified: it asserts the exact backoff schedule, so a harmless change to backoff breaks it' },
  async () => {
    const events = []
    const broken = async (trackingNumber) => {
      events.push(`carrier ${trackingNumber}`)
      throw new CarrierUnavailableError('carrier returned 500')
    }
    const spy = spySender()
    const notifier = new Notifier(broken, spy.send, async (ms) => {
      events.push(`sleep ${ms}ms`)
    })

    await assert.rejects(() => notifier.notify('TRACK-123'))

    assert.deepEqual(events, [
      'carrier TRACK-123',
      'sleep 100ms',
      'carrier TRACK-123',
      'sleep 100ms',
      'carrier TRACK-123',
    ])
  },
)

// The rewrite. It keeps exactly one interaction assertion, the one a customer
// could notice: no message was sent. How many times we retried and how long we
// waited are free to change.
test('giving up tells nobody and surfaces the failure', async () => {
  const broken = async () => {
    throw new CarrierUnavailableError('carrier returned 500')
  }
  const spy = spySender()
  const notifier = new Notifier(broken, spy.send, noSleep)

  await assert.rejects(() => notifier.notify('TRACK-123'), CarrierUnavailableError)
  assert.deepEqual(spy.sent, [])
})
