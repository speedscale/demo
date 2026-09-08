package notifier

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"testing"
)

func loadFixture(t *testing.T, name string) []byte {
	t.Helper()
	body, err := os.ReadFile(filepath.Join("..", "..", "fixtures", name))
	if err != nil {
		t.Fatal(err)
	}
	return body
}

func serveFixture(t *testing.T, body []byte) string {
	t.Helper()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	}))
	t.Cleanup(server.Close)
	return server.URL
}

func TestCapturedFixtureParses(t *testing.T) {
	baseURL := serveFixture(t, loadFixture(t, "carrier-shipment-delayed.json"))
	status, err := NewCarrierClient(baseURL, "secret-key").Lookup("TRACK-123")
	if err != nil {
		t.Fatal(err)
	}
	if status != "delayed" {
		t.Fatalf("got %q, expected delayed", status)
	}
}

func TestRenamedFieldIsRejected(t *testing.T) {
	baseURL := serveFixture(t, loadFixture(t, "carrier-shipment-delayed-v2.json"))
	_, err := NewCarrierClient(baseURL, "secret-key").Lookup("TRACK-123")
	if !errors.Is(err, ErrCarrierContract) {
		t.Fatalf("expected ErrCarrierContract, got %v", err)
	}
	if errors.Is(err, ErrCarrierUnavailable) {
		t.Fatal("a contract change is not an outage")
	}
}

func TestLiveCarrierContractAndFixtureShape(t *testing.T) {
	if os.Getenv("CARRIER_CONTRACT_TEST") != "1" {
		t.Skip("set CARRIER_CONTRACT_TEST=1 to call the real carrier")
	}
	baseURL := os.Getenv("CARRIER_URL")
	apiKey := os.Getenv("CARRIER_API_KEY")
	trackingNumber := os.Getenv("CARRIER_TRACKING_NUMBER")
	if baseURL == "" || apiKey == "" || trackingNumber == "" {
		t.Fatal("CARRIER_URL, CARRIER_API_KEY, and CARRIER_TRACKING_NUMBER are required")
	}

	if _, err := NewCarrierClient(baseURL, apiKey).Lookup(trackingNumber); err != nil {
		t.Fatalf("live carrier no longer satisfies the client contract: %v", err)
	}

	req, err := http.NewRequest(http.MethodGet, baseURL+"/shipments/"+url.PathEscape(trackingNumber), nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("X-API-Key", apiKey)
	req.Header.Set("Accept", "application/json")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var live map[string]any
	if err := json.NewDecoder(resp.Body).Decode(&live); err != nil {
		t.Fatal(err)
	}
	var captured map[string]any
	if err := json.Unmarshal(loadFixture(t, "carrier-shipment-delayed.json"), &captured); err != nil {
		t.Fatal(err)
	}
	for key := range captured {
		if _, exists := live[key]; !exists {
			t.Errorf("live response is missing captured field %q", key)
		}
	}
}
