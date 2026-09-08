package notifier

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

// HTTPShipmentStatus is the production ShipmentStatus: it asks the carrier's
// HTTP API. Nothing in this post's tests runs it; that is deliberate and the
// post says why.
func HTTPShipmentStatus(baseURL string) ShipmentStatus {
	client := &http.Client{Timeout: 2 * time.Second}

	return func(trackingNumber string) (string, error) {
		resp, err := client.Get(baseURL + "/shipments/" + trackingNumber)
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
}
