import { CarrierContractError } from './errors.js'

export const maxAttempts = 3
const baseBackoffMs = 100

export class Notifier {
  #getShipmentStatus
  #send
  #recorder
  #sleep

  constructor(getShipmentStatus, send, recorder, sleep) {
    this.#getShipmentStatus = getShipmentStatus
    this.#send = send
    this.#recorder = recorder
    this.#sleep = sleep
  }

  async notify(trackingNumber) {
    if (await this.#recorder.notified(trackingNumber)) {
      return
    }
    const status = await this.#lookup(trackingNumber)
    if (status !== 'delayed') {
      return
    }

    const message = `Package ${trackingNumber} is delayed`
    await this.#send(trackingNumber, message)
    await this.#recorder.record(trackingNumber, message)
  }

  async #lookup(trackingNumber) {
    let lastFailure
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.#getShipmentStatus(trackingNumber)
      } catch (failure) {
        if (failure instanceof CarrierContractError) {
          throw failure
        }
        lastFailure = failure
        if (attempt < maxAttempts) {
          await this.#sleep(baseBackoffMs * 2 ** (attempt - 1))
        }
      }
    }
    throw lastFailure
  }
}
