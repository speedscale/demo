package notifier

import "sync"

// MemoryRecorder is a fake: a working, stateful implementation of Recorder.
type MemoryRecorder struct {
	mu       sync.Mutex
	messages map[string]string
}

func NewMemoryRecorder() *MemoryRecorder {
	return &MemoryRecorder{messages: make(map[string]string)}
}

func (r *MemoryRecorder) Record(trackingNumber, message string) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, exists := r.messages[trackingNumber]; !exists {
		r.messages[trackingNumber] = message
	}
	return nil
}

func (r *MemoryRecorder) Notified(trackingNumber string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	_, exists := r.messages[trackingNumber]
	return exists
}

func (r *MemoryRecorder) Message(trackingNumber string) (string, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	message, exists := r.messages[trackingNumber]
	return message, exists
}

func (r *MemoryRecorder) Count() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.messages)
}
