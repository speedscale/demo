package notifier

import (
	"context"
	"errors"
	"testing"
	"time"
)

// noSleep is the whole reason the sleep seam exists. The retry tests below
// finish instantly instead of waiting for real backoff.
func noSleep(time.Duration) {}

func TestNotifyDelayedPackage(t *testing.T) {
	delayed := func(string) (string, error) { return "delayed", nil }
	n := New(delayed, noSleep)

	message, err := n.Notify("TRACK-123")
	if err != nil {
		t.Fatal(err)
	}
	if message != "Package TRACK-123 is delayed" {
		t.Fatalf("unexpected message: %q", message)
	}
}

func TestNotifyDeliveredPackage(t *testing.T) {
	delivered := func(string) (string, error) { return "delivered", nil }
	n := New(delivered, noSleep)

	message, err := n.Notify("TRACK-123")
	if err != nil {
		t.Fatal(err)
	}
	if message != "" {
		t.Fatalf("expected no message, got %q", message)
	}
}

func TestNotifyReportsCarrierUnavailable(t *testing.T) {
	unavailable := func(string) (string, error) { return "", ErrCarrierUnavailable }
	n := New(unavailable, noSleep)

	message, err := n.Notify("TRACK-123")
	if !errors.Is(err, ErrCarrierUnavailable) {
		t.Fatalf("expected a carrier-unavailable error, got %v", err)
	}
	if message != "" {
		t.Fatalf("expected no message, got %q", message)
	}
}

func TestNotifyReportsTimeout(t *testing.T) {
	timeout := func(string) (string, error) { return "", context.DeadlineExceeded }
	n := New(timeout, noSleep)

	if _, err := n.Notify("TRACK-123"); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("expected a timeout, got %v", err)
	}
}

func TestNotifyIgnoresAnUnknownStatus(t *testing.T) {
	for _, status := range []string{"", "in_transit", "held_at_customs"} {
		answer := func(string) (string, error) { return status, nil }
		n := New(answer, noSleep)

		message, err := n.Notify("TRACK-123")
		if err != nil {
			t.Fatalf("status %q: %v", status, err)
		}
		if message != "" {
			t.Fatalf("status %q: expected no message, got %q", status, message)
		}
	}
}

func TestNotifyRetriesUntilTheCarrierAnswers(t *testing.T) {
	calls := 0
	flaky := func(string) (string, error) {
		calls++
		if calls == 1 {
			return "", ErrCarrierUnavailable
		}
		return "delayed", nil
	}
	sleeps := 0
	n := New(flaky, func(time.Duration) { sleeps++ })

	message, err := n.Notify("TRACK-123")
	if err != nil {
		t.Fatal(err)
	}
	if message != "Package TRACK-123 is delayed" {
		t.Fatalf("unexpected message: %q", message)
	}
	if calls != 2 {
		t.Fatalf("expected 2 carrier calls, got %d", calls)
	}
	if sleeps != 1 {
		t.Fatalf("expected 1 backoff between attempts, got %d", sleeps)
	}
}

func TestNotifyGivesUpAfterTheBudget(t *testing.T) {
	calls := 0
	broken := func(string) (string, error) {
		calls++
		return "", ErrCarrierUnavailable
	}
	n := New(broken, noSleep)

	if _, err := n.Notify("TRACK-123"); !errors.Is(err, ErrCarrierUnavailable) {
		t.Fatalf("expected a carrier-unavailable error, got %v", err)
	}
	if calls != maxAttempts {
		t.Fatalf("expected %d attempts, got %d", maxAttempts, calls)
	}
}
