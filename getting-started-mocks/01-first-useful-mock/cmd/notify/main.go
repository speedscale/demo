// Command notify is the production wiring: the real HTTP carrier goes into
// the same seam the tests fill with a canned answer.
package main

import (
	"fmt"
	"os"

	"github.com/speedscale/demo/getting-started-mocks/01-first-useful-mock/notifier"
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

	n := notifier.New(notifier.HTTPShipmentStatus(baseURL))
	message, err := n.Notify(os.Args[1])
	if err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		os.Exit(1)
	}
	if message == "" {
		fmt.Println("nothing to send")
		return
	}
	fmt.Println(message)
}
