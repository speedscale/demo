// The production wiring: the real HTTP carrier goes into the same seam the
// tests fill with a canned answer.
import { httpShipmentStatus } from './notifier/carrier.js'
import { Notifier } from './notifier/notifier.js'

const [trackingNumber] = process.argv.slice(2)
if (!trackingNumber) {
  console.error('usage: node cli.js TRACKING-NUMBER')
  process.exit(2)
}

const baseUrl = process.env.CARRIER_URL ?? 'https://api.example-carrier.test'
const notifier = new Notifier(httpShipmentStatus(baseUrl))
console.log((await notifier.notify(trackingNumber)) ?? 'nothing to send')
