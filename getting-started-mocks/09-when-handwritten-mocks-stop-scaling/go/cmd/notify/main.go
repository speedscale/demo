// Command notify is the production wiring: the real HTTP carrier, a real
// sender and a real sleep go into the same seams the tests fill.
package main

import (
	"fmt"
	"os"
	"time"

	"github.com/speedscale/demo/getting-started-mocks/09-when-handwritten-mocks-stop-scaling/go/notifier"
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
	printSender := func(_ string, message string) error {
		fmt.Println(message)
		return nil
	}

	apiKey := os.Getenv("CARRIER_API_KEY")
	client := notifier.NewCarrierClient(baseURL, apiKey)
	n := notifier.New(client.Status(), printSender, notifier.NewMemoryRecorder(), time.Sleep)
	if err := n.Notify(os.Args[1]); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
}
