import { CarrierUnavailableError, TimeoutError } from './errors.js'

export class CarrierClient {
  #baseUrl
  #apiKey

  constructor(baseUrl, apiKey) {
    this.#baseUrl = baseUrl.replace(/\/+$/, '')
    this.#apiKey = apiKey
  }

  async lookup(trackingNumber) {
    let response
    try {
      response = await fetch(`${this.#baseUrl}/shipments/${encodeURIComponent(trackingNumber)}`, {
        headers: {
          'X-API-Key': this.#apiKey,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(2000),
      })
    } catch (failure) {
      if (failure.name === 'TimeoutError' || failure.name === 'AbortError') {
        throw new TimeoutError(`carrier did not answer in time: ${failure.message}`)
      }
      throw failure
    }

    if (!response.ok) {
      throw new CarrierUnavailableError(`carrier returned ${response.status}`)
    }
    const shipment = await response.json()
    return shipment.status
  }
}
