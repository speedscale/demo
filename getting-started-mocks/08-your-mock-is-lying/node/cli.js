// The production wiring: the real HTTP carrier, a real sender and a real sleep
// go into the same seams the tests fill.
import { setTimeout as sleep } from 'node:timers/promises'

import { CarrierClient } from './notifier/carrier.js'
import { Notifier } from './notifier/notifier.js'
import { MemoryRecorder } from './notifier/recorder.js'

const [trackingNumber] = process.argv.slice(2)
if (!trackingNumber) {
  console.error('usage: node cli.js TRACKING-NUMBER')
  process.exit(2)
}

const baseUrl = process.env.CARRIER_URL ?? 'https://api.example-carrier.test'
const apiKey = process.env.CARRIER_API_KEY ?? ''
// In production the sender would hand the message to an email or SMS
// provider. Printing it keeps the example runnable.
const printSender = async (_trackingNumber, message) => console.log(message)

const client = new CarrierClient(baseUrl, apiKey)
const notifier = new Notifier(client.lookup.bind(client), printSender, new MemoryRecorder(), sleep)
await notifier.notify(trackingNumber)
