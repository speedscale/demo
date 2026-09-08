package notifier

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestClientSendsTrackingNumberAndAPIKey(t *testing.T) {
	var gotPath, gotKey, gotAccept string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotKey = r.Header.Get("X-API-Key")
		gotAccept = r.Header.Get("Accept")
		_, _ = w.Write([]byte(`{"status":"delayed"}`))
	}))
	defer server.Close()

	if _, err := NewCarrierClient(server.URL, "secret-key").Lookup("TRACK-123"); err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(gotPath, "TRACK-123") {
		t.Errorf("path %q does not contain the tracking number", gotPath)
	}
	if gotKey != "secret-key" {
		t.Errorf("X-API-Key was %q", gotKey)
	}
	if gotAccept != "application/json" {
		t.Errorf("Accept was %q", gotAccept)
	}
}

func TestClientParsesKnownShipmentStates(t *testing.T) {
	for _, status := range []string{"delayed", "delivered", "in_transit", "lost"} {
		t.Run(status, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				_, _ = w.Write([]byte(`{"status":"` + status + `"}`))
			}))
			defer server.Close()
			got, err := NewCarrierClient(server.URL, "secret-key").Lookup("TRACK-123")
			if err != nil {
				t.Fatal(err)
			}
			if got != status {
				t.Fatalf("got %q, expected %q", got, status)
			}
		})
	}
}

func TestClientTreatsNon200AsCarrierUnavailable(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "upstream is down", http.StatusServiceUnavailable)
	}))
	defer server.Close()

	_, err := NewCarrierClient(server.URL, "secret-key").Lookup("TRACK-123")
	if !errors.Is(err, ErrCarrierUnavailable) {
		t.Fatalf("expected ErrCarrierUnavailable, got %v", err)
	}
}

func TestClientFailsCleanlyOnMalformedJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"status": `))
	}))
	defer server.Close()

	if _, err := NewCarrierClient(server.URL, "secret-key").Lookup("TRACK-123"); err == nil {
		t.Fatal("expected malformed JSON to fail")
	}
}
