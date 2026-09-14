// A fake: a working, stateful implementation of the recorder seam.
export class MemoryRecorder {
  #messages = new Map()

  async record(trackingNumber, message) {
    if (!this.#messages.has(trackingNumber)) {
      this.#messages.set(trackingNumber, message)
    }
  }

  async notified(trackingNumber) {
    return this.#messages.has(trackingNumber)
  }

  message(trackingNumber) {
    return this.#messages.get(trackingNumber) ?? null
  }

  get count() {
    return this.#messages.size
  }
}
