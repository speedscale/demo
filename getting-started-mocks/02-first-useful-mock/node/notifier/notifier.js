// Turns a shipment status into a message worth sending.
//
// `getShipmentStatus` is the seam: an async function that answers "where is
// this package?" for one tracking number. Production wires it to the carrier's
// HTTP API (see carrier.js). A test hands in whatever answer it needs.
export class Notifier {
  #getShipmentStatus

  constructor(getShipmentStatus) {
    this.#getShipmentStatus = getShipmentStatus
  }

  // Returns the message to send, or null when nothing needs saying.
  async notify(trackingNumber) {
    const status = await this.#getShipmentStatus(trackingNumber)
    if (status === 'delayed') {
      return `Package ${trackingNumber} is delayed`
    }
    return null
  }
}
