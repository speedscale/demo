// The production getShipmentStatus: it asks the carrier's HTTP API. This is
// the same code that used to live inside notify(), moved behind the seam.
// Nothing in this post's tests runs it; that is deliberate and the post says why.
export function httpShipmentStatus(baseUrl) {
  return async (trackingNumber) => {
    const response = await fetch(`${baseUrl}/shipments/${trackingNumber}`)
    if (!response.ok) {
      throw new Error(`carrier returned ${response.status}`)
    }
    const shipment = await response.json()
    return shipment.status
  }
}
