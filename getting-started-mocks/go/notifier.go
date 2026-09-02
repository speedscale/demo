package notifier

type ShipmentStatus func(trackingNumber string) string

func NotificationFor(getShipmentStatus ShipmentStatus, trackingNumber string) (string, bool) {
	if getShipmentStatus(trackingNumber) == "delayed" {
		return "Package " + trackingNumber + " is delayed", true
	}
	return "", false
}
