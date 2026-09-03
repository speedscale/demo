import { CarrierUnavailableError, TimeoutError } from './errors.js'

// The production getShipmentStatus: it asks the carrier's HTTP API. Nothing in
// this post's tests runs it; that is deliberate and the post says why.
export function httpShipmentStatus(baseUrl) {
  return async (trackingNumber) => {
    let response
    try {
      response = await fetch(`${baseUrl}/shipments/${trackingNumber}`, {
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
