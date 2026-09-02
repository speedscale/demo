// Command notify is the production wiring: the real HTTP carrier and a real
// sleep go into the same seams the tests fill with canned behavior.
package main

import (
	"fmt"
	"os"
	"time"

	"github.com/speedscale/demo/getting-started-mocks/03-make-failure-boring/go/notifier"
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

	n := notifier.New(notifier.HTTPShipmentStatus(baseURL), time.Sleep)
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
