package notifier

import "testing"

func assertNotifiedOnce(t *testing.T, sender *spySender, recorder *MemoryRecorder) {
	t.Helper()
	if len(sender.messages) != 1 {
		t.Fatalf("sent %d messages, expected 1", len(sender.messages))
	}
	if recorder.Count() != 1 {
		t.Fatalf("recorded %d packages, expected 1", recorder.Count())
	}
}

func TestSameBehaviorWithFunctionStub(t *testing.T) {
	sender := &spySender{}
	recorder := NewMemoryRecorder()
	n := New(stubStatus("delayed"), sender.Send, recorder, dummySleeper)

	if err := n.Notify("TRACK-123"); err != nil {
		t.Fatal(err)
	}
	assertNotifiedOnce(t, sender, recorder)
}

func TestSameBehaviorWithFakeServer(t *testing.T) {
	baseURL := serveFixture(t, loadFixture(t, "carrier-shipment-delayed.json"))
	client := NewCarrierClient(baseURL, "secret-key")
	sender := &spySender{}
	recorder := NewMemoryRecorder()
	n := New(client.Status(), sender.Send, recorder, dummySleeper)

	if err := n.Notify("TRACK-123"); err != nil {
		t.Fatal(err)
	}
	assertNotifiedOnce(t, sender, recorder)
}
