// The retry budget is deliberately a constant. Making it configurable is the
// exercise at the end of the post.
export const maxAttempts = 3
const backoffMs = 100

// Turns a shipment status into a message worth sending.
//
// `getShipmentStatus` answers "where is this package?". `sleep` is the second
// seam: production waits between retries, a test does not.
export class Notifier {
  #getShipmentStatus
  #sleep

  constructor(getShipmentStatus, sleep) {
    this.#getShipmentStatus = getShipmentStatus
    this.#sleep = sleep
  }

  // Returns the message to send, or null when nothing needs saying.
  async notify(trackingNumber) {
    const status = await this.#lookup(trackingNumber)
    if (status === 'delayed') {
      return `Package ${trackingNumber} is delayed`
    }
    // Any other answer, including one we have never heard of, means there is
    // nothing to tell the customer. It must not crash the run.
    return null
  }

  // Asks the carrier, retrying a failure until the budget runs out.
  async #lookup(trackingNumber) {
    let lastFailure
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.#getShipmentStatus(trackingNumber)
      } catch (failure) {
        lastFailure = failure
        if (attempt < maxAttempts) {
          await this.#sleep(backoffMs)
        }
      }
    }
    throw lastFailure
  }
}
