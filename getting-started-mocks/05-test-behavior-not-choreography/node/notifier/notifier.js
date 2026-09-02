// The retry budget is deliberately a constant. Making it configurable is the
// exercise at the end of the post.
export const maxAttempts = 3
const baseBackoffMs = 100

// Doubles the wait after each failed attempt, so a struggling carrier is not
// hammered. This is the change that breaks the over-specified test in this
// post while leaving every observable outcome alone.
function backoffFor(attempt) {
  return baseBackoffMs * 2 ** (attempt - 1)
}

// Turns a shipment status into a message worth sending.
//
// `getShipmentStatus` answers "where is this package?". `send` delivers one
// finished message and is the first seam whose whole point is a side effect
// rather than an answer. `sleep` keeps retries out of real time.
export class Notifier {
  #getShipmentStatus
  #send
  #sleep

  constructor(getShipmentStatus, send, sleep) {
    this.#getShipmentStatus = getShipmentStatus
    this.#send = send
    this.#sleep = sleep
  }

  // Tells the customer if there is anything worth telling them. It no longer
  // returns the message, so a test cannot check a return value any more.
  async notify(trackingNumber) {
    const status = await this.#lookup(trackingNumber)
    if (status === 'delayed') {
      await this.#send(`Package ${trackingNumber} is delayed`)
    }
    // Any other answer, including one we have never heard of, means there is
    // nothing to tell the customer. It must not crash the run.
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
          await this.#sleep(backoffFor(attempt))
        }
      }
    }
    throw lastFailure
  }
}
