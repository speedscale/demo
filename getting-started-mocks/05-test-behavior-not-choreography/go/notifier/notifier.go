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
	baseBackoff = 100 * time.Millisecond
)

// backoffFor doubles the wait after each failed attempt, so a struggling
// carrier is not hammered. This is the change that breaks the over-specified
// test in this post while leaving every observable outcome alone.
func backoffFor(attempt int) time.Duration {
	return baseBackoff * time.Duration(1<<(attempt-1))
}

// ShipmentStatus answers "where is this package?" for one tracking number.
type ShipmentStatus func(trackingNumber string) (string, error)

// Sleep is the second seam. Production waits between retries. A test does not.
type Sleep func(d time.Duration)

// Sender delivers one finished message to the customer. It is the third seam,
// and the first one whose whole point is a side effect rather than an answer.
type Sender func(message string) error

// Notifier turns a shipment status into a message worth sending.
type Notifier struct {
	status ShipmentStatus
	send   Sender
	sleep  Sleep
}

// New builds a Notifier around a way of asking for a status, a way of telling
// the customer, and a way of waiting.
func New(status ShipmentStatus, send Sender, sleep Sleep) *Notifier {
	return &Notifier{status: status, send: send, sleep: sleep}
}

// Notify tells the customer if there is anything worth telling them. It no
// longer returns the message, so a test cannot check a return value any more.
func (n *Notifier) Notify(trackingNumber string) error {
	status, err := n.lookup(trackingNumber)
	if err != nil {
		return err
	}
	if status == "delayed" {
		return n.send(fmt.Sprintf("Package %s is delayed", trackingNumber))
	}
	// Any other answer, including one we have never heard of, means there is
	// nothing to tell the customer. An unknown status must not crash the run.
	return nil
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
			n.sleep(backoffFor(attempt))
		}
	}
	return "", lastErr
}
