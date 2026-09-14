package notifier

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

type CarrierClient struct {
	baseURL string
	apiKey  string
	http    *http.Client
}

func NewCarrierClient(baseURL, apiKey string) *CarrierClient {
	return &CarrierClient{
		baseURL: strings.TrimRight(baseURL, "/"),
		apiKey:  apiKey,
		http:    &http.Client{Timeout: 2 * time.Second},
	}
}

func (c *CarrierClient) Lookup(trackingNumber string) (string, error) {
	requestURL := c.baseURL + "/shipments/" + url.PathEscape(trackingNumber)
	req, err := http.NewRequest(http.MethodGet, requestURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("X-API-Key", c.apiKey)
	req.Header.Set("Accept", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("%w: %s", ErrCarrierUnavailable, resp.Status)
	}

	var shipment struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&shipment); err != nil {
		return "", err
	}
	return shipment.Status, nil
}

func (c *CarrierClient) Status() ShipmentStatus {
	return c.Lookup
}
