// The package notifier before it had a seam. It talks to the carrier directly,
// which is exactly why it cannot be tested: nothing in a test can make the
// carrier say a package is delayed.

const carrierUrl = 'https://api.example-carrier.test'

// Returns the message to send to the customer, or null when there is nothing to say.
export async function notify(trackingNumber) {
  const response = await fetch(`${carrierUrl}/shipments/${trackingNumber}`)
  const shipment = await response.json()

  if (shipment.status === 'delayed') {
    return `Package ${trackingNumber} is delayed`
  }
  return null
}
