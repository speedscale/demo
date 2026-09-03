// Package notifier decides whether a customer should hear about their package.
package notifier

import (
	"errors"
	"fmt"
	"time"
)

// ErrCarrierUnavailable is what the lookup returns when the carrier is reachable
// but refuses to answer. It is the HTTP 500 case, not a network failure.
var ErrCarrierUnavailable = errors.New("carrier unavailable")

// The retry budget is deliberately a constant. Making it configurable is the
// exercise at the end of the post.
const (
	maxAttempts = 3
	backoff     = 100 * time.Millisecond
)

// ShipmentStatus answers "where is this package?" for one tracking number.
type ShipmentStatus func(trackingNumber string) (string, error)

// Sleep is the second seam. Production waits between retries. A test does not.
type Sleep func(d time.Duration)

// Notifier turns a shipment status into a message worth sending.
type Notifier struct {
	status ShipmentStatus
	sleep  Sleep
}

// New builds a Notifier around a way of asking for a status and a way of waiting.
func New(status ShipmentStatus, sleep Sleep) *Notifier {
	return &Notifier{status: status, sleep: sleep}
}

// Notify returns the message to send, or "" when nothing needs saying.
func (n *Notifier) Notify(trackingNumber string) (string, error) {
	status, err := n.lookup(trackingNumber)
	if err != nil {
		return "", err
	}
	if status == "delayed" {
		return fmt.Sprintf("Package %s is delayed", trackingNumber), nil
	}
	// Any other answer, including one we have never heard of, means there is
	// nothing to tell the customer. An unknown status must not crash the run.
	return "", nil
}

// lookup asks the carrier, retrying a failure until the budget runs out.
func (n *Notifier) lookup(trackingNumber string) (string, error) {
	var lastErr error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		status, err := n.status(trackingNumber)
		if err == nil {
			return status, nil
		}
		lastErr = err
		if attempt < maxAttempts {
			n.sleep(backoff)
		}
	}
	return "", lastErr
}
