// The production wiring: the real HTTP carrier and a real sleep go into the
// same seams the tests fill with canned behavior.
import { setTimeout as sleep } from 'node:timers/promises'

import { httpShipmentStatus } from './notifier/carrier.js'
import { Notifier } from './notifier/notifier.js'

const [trackingNumber] = process.argv.slice(2)
if (!trackingNumber) {
  console.error('usage: node cli.js TRACKING-NUMBER')
  process.exit(2)
}

const baseUrl = process.env.CARRIER_URL ?? 'https://api.example-carrier.test'
const notifier = new Notifier(httpShipmentStatus(baseUrl), sleep)
console.log((await notifier.notify(trackingNumber)) ?? 'nothing to send')
