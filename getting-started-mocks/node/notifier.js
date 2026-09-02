export function notificationFor(getShipmentStatus, trackingNumber) {
  if (getShipmentStatus(trackingNumber) === 'delayed') {
    return `Package ${trackingNumber} is delayed`
  }
  return null
}
