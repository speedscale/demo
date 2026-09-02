package notifier

import (
	"encoding/json"
	"fmt"
	"net/http"
)

// HTTPShipmentStatus is the production ShipmentStatus: it asks the carrier's
// HTTP API. This is the same code that used to live inside Notify, moved
// behind the seam. Nothing in this post's tests runs it; that is deliberate
// and the post says why.
func HTTPShipmentStatus(baseURL string) ShipmentStatus {
	return func(trackingNumber string) (string, error) {
		resp, err := http.Get(baseURL + "/shipments/" + trackingNumber)
		if err != nil {
			return "", err
		}
		defer resp.Body.Close()

		if resp.StatusCode != http.StatusOK {
			return "", fmt.Errorf("carrier returned %s", resp.Status)
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
