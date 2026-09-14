// Package notifier decides whether a customer should hear about their package.
package notifier

import (
	"errors"
	"fmt"
	"time"
)

var (
	ErrCarrierUnavailable = errors.New("carrier unavailable")
	ErrCarrierContract    = errors.New("carrier contract changed")
)

const (
	maxAttempts = 3
	baseBackoff = 100 * time.Millisecond
)

type ShipmentStatus func(trackingNumber string) (string, error)
type Sleep func(time.Duration)
type Sender func(trackingNumber, message string) error

type Recorder interface {
	Record(trackingNumber, message string) error
	Notified(trackingNumber string) bool
}

type Notifier struct {
	status   ShipmentStatus
	send     Sender
	recorder Recorder
	sleep    Sleep
}

func New(status ShipmentStatus, send Sender, recorder Recorder, sleep Sleep) *Notifier {
	return &Notifier{status: status, send: send, recorder: recorder, sleep: sleep}
}

func (n *Notifier) Notify(trackingNumber string) error {
	if n.recorder.Notified(trackingNumber) {
		return nil
	}

	status, err := n.lookup(trackingNumber)
	if err != nil || status != "delayed" {
		return err
	}

	message := fmt.Sprintf("Package %s is delayed", trackingNumber)
	if err := n.send(trackingNumber, message); err != nil {
		return err
	}
	return n.recorder.Record(trackingNumber, message)
}

func (n *Notifier) lookup(trackingNumber string) (string, error) {
	var lastErr error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		status, err := n.status(trackingNumber)
		if err == nil {
			return status, nil
		}
		if errors.Is(err, ErrCarrierContract) {
			return "", err
		}
		lastErr = err
		if attempt < maxAttempts {
			n.sleep(baseBackoff * time.Duration(1<<(attempt-1)))
		}
	}
	return "", lastErr
}
