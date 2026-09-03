// Command notify is the production wiring: the real HTTP carrier, a real
// sender and a real sleep go into the same seams the tests fill.
package main

import (
	"fmt"
	"os"
	"time"

	"github.com/speedscale/demo/getting-started-mocks/04-did-it-actually-send/go/notifier"
)

func main() {
	if len(os.Args) != 2 {
		fmt.Fprintln(os.Stderr, "usage: notify TRACKING-NUMBER")
		os.Exit(2)
	}

	baseURL := os.Getenv("CARRIER_URL")
	if baseURL == "" {
		baseURL = "https://api.example-carrier.test"
	}

	// In production the sender would hand the message to an email or SMS
	// provider. Printing it keeps the example runnable.
	printSender := func(message string) error {
		fmt.Println(message)
		return nil
	}

	n := notifier.New(notifier.HTTPShipmentStatus(baseURL), printSender, time.Sleep)
	if err := n.Notify(os.Args[1]); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}
