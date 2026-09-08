import assert from 'node:assert/strict'
import test from 'node:test'

import { CarrierContractError, CarrierUnavailableError } from './errors.js'
import { Notifier } from './notifier.js'
import { MemoryRecorder } from './recorder.js'

const dummySleep = async () => {}
const stubStatus = (status) => async () => status

function spySender() {
  const messages = []
  const send = async (_trackingNumber, message) => messages.push(message)
  send.messages = messages
  return send
}

test('notifies the customer only once', async () => {
  const send = spySender()
  const recorder = new MemoryRecorder()
  const notifier = new Notifier(stubStatus('delayed'), send, recorder, dummySleep)

  for (let i = 0; i < 3; i++) {
    await notifier.notify('TRACK-123')
  }

  assert.equal(send.messages.length, 1)
  assert.equal(recorder.count, 1)
})

test('does not record a delivered package', async () => {
  const send = spySender()
  const recorder = new MemoryRecorder()
  await new Notifier(stubStatus('delivered'), send, recorder, dummySleep).notify('TRACK-123')
  assert.deepEqual(send.messages, [])
  assert.equal(recorder.count, 0)
})

function mockSender(expectedMessage) {
  let calls = 0
  const send = async (_trackingNumber, message) => {
    calls++
    assert.equal(calls, 1, `sender called ${calls} times, expected exactly 1`)
    assert.equal(message, expectedMessage)
  }
  send.verify = () => assert.equal(calls, 1, `sender called ${calls} times, expected exactly 1`)
  return send
}

test('a strict mock owns its expectation', async () => {
  const send = mockSender('Package TRACK-123 is delayed')
  await new Notifier(stubStatus('delayed'), send, new MemoryRecorder(), dummySleep).notify('TRACK-123')
  send.verify()
})

test('surfaces a carrier failure without sending', async () => {
  const send = spySender()
  const broken = async () => {
    throw new CarrierUnavailableError('carrier returned 503')
  }
  const notifier = new Notifier(broken, send, new MemoryRecorder(), dummySleep)
  await assert.rejects(() => notifier.notify('TRACK-123'), CarrierUnavailableError)
  assert.deepEqual(send.messages, [])
})

test('does not retry a contract failure', async () => {
  let calls = 0
  const drifted = async () => {
    calls++
    throw new CarrierContractError('no status field')
  }
  const notifier = new Notifier(drifted, spySender(), new MemoryRecorder(), dummySleep)
  await assert.rejects(() => notifier.notify('TRACK-123'), CarrierContractError)
  assert.equal(calls, 1)
})
