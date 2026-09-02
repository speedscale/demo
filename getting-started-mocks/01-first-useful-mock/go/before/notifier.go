// Package before is the package notifier as it looked before it had a seam.
// Notify talks to the carrier directly, which is exactly why it cannot be
// tested: nothing in a test can make the carrier say a package is delayed.
package before

import (
	"encoding/json"
	"fmt"
	"net/http"
)

const carrierURL = "https://api.example-carrier.test"

// Notify returns the message to send to the customer, or "" when there is
// nothing to say.
func Notify(trackingNumber string) (string, error) {
	resp, err := http.Get(carrierURL + "/shipments/" + trackingNumber)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	var shipment struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&shipment); err != nil {
		return "", err
	}

	if shipment.Status == "delayed" {
		return fmt.Sprintf("Package %s is delayed", trackingNumber), nil
	}
	return "", nil
}
