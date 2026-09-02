package notifier

import "testing"

func TestNotificationForDelayedPackage(t *testing.T) {
	getShipmentStatus := func(string) string { return "delayed" }

	message, notify := NotificationFor(getShipmentStatus, "TRACK-123")

	if !notify {
		t.Fatal("expected a notification")
	}
	if message != "Package TRACK-123 is delayed" {
		t.Fatalf("unexpected message: %q", message)
	}
}

func TestNotificationForDeliveredPackage(t *testing.T) {
	getShipmentStatus := func(string) string { return "delivered" }

	message, notify := NotificationFor(getShipmentStatus, "TRACK-123")

	if notify {
		t.Fatalf("expected no notification, got %q", message)
	}
}
