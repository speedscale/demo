// Package notifier decides whether a customer should hear about their package.
package notifier

import "fmt"

// ShipmentStatus answers "where is this package?" for one tracking number.
//
// This is the seam. Production wires it to the carrier's HTTP API (see
// HTTPShipmentStatus). A test hands in whatever answer it needs.
type ShipmentStatus func(trackingNumber string) (string, error)

// Notifier turns a shipment status into a message worth sending.
type Notifier struct {
	status ShipmentStatus
}

// New builds a Notifier around the given way of looking up a status.
func New(status ShipmentStatus) *Notifier {
	return &Notifier{status: status}
}

// Notify returns the message to send, or "" when nothing needs saying.
func (n *Notifier) Notify(trackingNumber string) (string, error) {
	status, err := n.status(trackingNumber)
	if err != nil {
		return "", err
	}
	if status == "delayed" {
		return fmt.Sprintf("Package %s is delayed", trackingNumber), nil
	}
	return "", nil
}
