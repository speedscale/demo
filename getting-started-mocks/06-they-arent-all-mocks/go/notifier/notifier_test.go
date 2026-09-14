package notifier

import (
	"errors"
	"testing"
	"time"
)

func dummySleeper(time.Duration) {}

func stubStatus(status string) ShipmentStatus {
	return func(string) (string, error) { return status, nil }
}

type spySender struct{ messages []string }

func (s *spySender) Send(_ string, message string) error {
	s.messages = append(s.messages, message)
	return nil
}

func TestCustomerIsNotifiedOnlyOnce(t *testing.T) {
	sender := &spySender{}
	recorder := NewMemoryRecorder()
	n := New(stubStatus("delayed"), sender.Send, recorder, dummySleeper)

	for i := 0; i < 3; i++ {
		if err := n.Notify("TRACK-123"); err != nil {
			t.Fatal(err)
		}
	}

	if len(sender.messages) != 1 {
		t.Fatalf("sent %d messages, expected 1", len(sender.messages))
	}
	if recorder.Count() != 1 {
		t.Fatalf("recorded %d packages, expected 1", recorder.Count())
	}
}

func TestDeliveredPackageIsNotRecorded(t *testing.T) {
	sender := &spySender{}
	recorder := NewMemoryRecorder()
	n := New(stubStatus("delivered"), sender.Send, recorder, dummySleeper)

	if err := n.Notify("TRACK-123"); err != nil {
		t.Fatal(err)
	}
	if len(sender.messages) != 0 || recorder.Count() != 0 {
		t.Fatalf("unexpected notification: messages=%q records=%d", sender.messages, recorder.Count())
	}
}

type mockSender struct {
	t               *testing.T
	expectedMessage string
	calls           int
}

func (m *mockSender) Send(_ string, message string) error {
	m.t.Helper()
	m.calls++
	if m.calls > 1 {
		m.t.Fatalf("sender called %d times, expected exactly 1", m.calls)
	}
	if message != m.expectedMessage {
		m.t.Fatalf("sender got %q, expected %q", message, m.expectedMessage)
	}
	return nil
}

func (m *mockSender) verify() {
	m.t.Helper()
	if m.calls != 1 {
		m.t.Fatalf("sender called %d times, expected exactly 1", m.calls)
	}
}

func TestStrictMockOwnsItsExpectation(t *testing.T) {
	sender := &mockSender{t: t, expectedMessage: "Package TRACK-123 is delayed"}
	n := New(stubStatus("delayed"), sender.Send, NewMemoryRecorder(), dummySleeper)
	if err := n.Notify("TRACK-123"); err != nil {
		t.Fatal(err)
	}
	sender.verify()
}

func TestCarrierFailureSurfacesWithoutSending(t *testing.T) {
	sender := &spySender{}
	broken := func(string) (string, error) { return "", ErrCarrierUnavailable }
	n := New(broken, sender.Send, NewMemoryRecorder(), dummySleeper)
	if err := n.Notify("TRACK-123"); !errors.Is(err, ErrCarrierUnavailable) {
		t.Fatalf("expected carrier unavailable, got %v", err)
	}
	if len(sender.messages) != 0 {
		t.Fatalf("unexpected messages: %q", sender.messages)
	}
}
