package notifier

import "testing"

func TestNotifyDelayedPackage(t *testing.T) {
	delayed := func(string) (string, error) { return "delayed", nil }
	n := New(delayed)

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
	n := New(delivered)

	message, err := n.Notify("TRACK-123")
	if err != nil {
		t.Fatal(err)
	}
	if message != "" {
		t.Fatalf("expected no message, got %q", message)
	}
}
