// The production wiring: the real HTTP carrier, a real sender and a real sleep
// go into the same seams the tests fill.
import { setTimeout as sleep } from 'node:timers/promises'

import { httpShipmentStatus } from './notifier/carrier.js'
import { Notifier } from './notifier/notifier.js'

const [trackingNumber] = process.argv.slice(2)
if (!trackingNumber) {
  console.error('usage: node cli.js TRACKING-NUMBER')
  process.exit(2)
}

const baseUrl = process.env.CARRIER_URL ?? 'https://api.example-carrier.test'
// In production the sender would hand the message to an email or SMS
// provider. Printing it keeps the example runnable.
const printSender = async (message) => console.log(message)

const notifier = new Notifier(httpShipmentStatus(baseUrl), printSender, sleep)
await notifier.notify(trackingNumber)
