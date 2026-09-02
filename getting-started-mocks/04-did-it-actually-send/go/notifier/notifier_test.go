package notifier

import (
	"context"
	"errors"
	"testing"
	"time"
)

// noSleep keeps the retry tests instant.
func noSleep(time.Duration) {}

// spySender is a Sender that remembers every message it was asked to deliver.
// It answers the only question this post cares about: did it actually send?
type spySender struct {
	sent []string
}

func (s *spySender) send(message string) error {
	s.sent = append(s.sent, message)
	return nil
}

func TestNotifySendsOneMessageForADelayedPackage(t *testing.T) {
	delayed := func(string) (string, error) { return "delayed", nil }
	spy := &spySender{}
	n := New(delayed, spy.send, noSleep)

	if err := n.Notify("TRACK-123"); err != nil {
		t.Fatal(err)
	}
	if len(spy.sent) != 1 {
		t.Fatalf("expected exactly 1 message, got %d: %q", len(spy.sent), spy.sent)
	}
	if spy.sent[0] != "Package TRACK-123 is delayed" {
		t.Fatalf("unexpected message: %q", spy.sent[0])
	}
}

func TestNotifySendsNothingForADeliveredPackage(t *testing.T) {
	delivered := func(string) (string, error) { return "delivered", nil }
	spy := &spySender{}
	n := New(delivered, spy.send, noSleep)

	if err := n.Notify("TRACK-123"); err != nil {
		t.Fatal(err)
	}
	if len(spy.sent) != 0 {
		t.Fatalf("expected no messages, got %q", spy.sent)
	}
}

func TestNotifySendsNothingWhenTheCarrierIsUnavailable(t *testing.T) {
	unavailable := func(string) (string, error) { return "", ErrCarrierUnavailable }
	spy := &spySender{}
	n := New(unavailable, spy.send, noSleep)

	if err := n.Notify("TRACK-123"); !errors.Is(err, ErrCarrierUnavailable) {
		t.Fatalf("expected a carrier-unavailable error, got %v", err)
	}
	if len(spy.sent) != 0 {
		t.Fatalf("expected no messages, got %q", spy.sent)
	}
}

func TestNotifySendsNothingOnTimeout(t *testing.T) {
	timeout := func(string) (string, error) { return "", context.DeadlineExceeded }
	spy := &spySender{}
	n := New(timeout, spy.send, noSleep)

	if err := n.Notify("TRACK-123"); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected a timeout, got %v", err)
	}
	if len(spy.sent) != 0 {
		t.Fatalf("expected no messages, got %q", spy.sent)
	}
}

func TestNotifySendsNothingForAnUnknownStatus(t *testing.T) {
	for _, status := range []string{"", "in_transit", "held_at_customs"} {
		answer := func(string) (string, error) { return status, nil }
		spy := &spySender{}
		n := New(answer, spy.send, noSleep)

		if err := n.Notify("TRACK-123"); err != nil {
			t.Fatalf("status %q: %v", status, err)
		}
		if len(spy.sent) != 0 {
			t.Fatalf("status %q: expected no messages, got %q", status, spy.sent)
		}
	}
}

func TestNotifyRetriesThenSends(t *testing.T) {
	calls := 0
	flaky := func(string) (string, error) {
		calls++
		if calls == 1 {
			return "", ErrCarrierUnavailable
		}
		return "delayed", nil
	}
	spy := &spySender{}
	n := New(flaky, spy.send, noSleep)

	if err := n.Notify("TRACK-123"); err != nil {
		t.Fatal(err)
	}
	if len(spy.sent) != 1 || spy.sent[0] != "Package TRACK-123 is delayed" {
		t.Fatalf("expected one delayed-package message, got %q", spy.sent)
	}
}

func TestNotifyGivesUpAfterTheBudget(t *testing.T) {
	calls := 0
	broken := func(string) (string, error) {
		calls++
		return "", ErrCarrierUnavailable
	}
	spy := &spySender{}
	n := New(broken, spy.send, noSleep)

	if err := n.Notify("TRACK-123"); !errors.Is(err, ErrCarrierUnavailable) {
		t.Fatalf("expected a carrier-unavailable error, got %v", err)
	}
	if calls != maxAttempts {
		t.Fatalf("expected %d attempts, got %d", maxAttempts, calls)
	}
	if len(spy.sent) != 0 {
		t.Fatalf("expected no messages, got %q", spy.sent)
	}
}
