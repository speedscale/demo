// Command traffic drives the tutorial orders service with the sequence in
// ../contract/traffic.json. See ../contract/SPEC.md, "Traffic driver".
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

type trafficFile struct {
	CatalogCalls int               `json:"catalog_calls"`
	OrderRounds  int               `json:"order_rounds"`
	ListCalls    int               `json:"list_calls"`
	Orders       []json.RawMessage `json:"orders"`
	BadRequests  []struct {
		Method string          `json:"method"`
		Path   string          `json:"path"`
		Body   json.RawMessage `json:"body"`
		Expect int             `json:"expect"`
	} `json:"bad_requests"`
}

type driver struct {
	base       string
	client     *http.Client
	sent       int
	unexpected int
	failed     bool
}

// do sends one request and returns the response body. A transport error is
// counted as a failure, an unexpected status as an unexpected response.
func (d *driver) do(method, path string, body json.RawMessage, want int) []byte {
	var rdr io.Reader
	if len(body) > 0 {
		var buf bytes.Buffer
		if err := json.Compact(&buf, body); err != nil {
			fmt.Printf("%s %s: bad body in traffic file: %v\n", method, path, err)
			d.failed = true
			return nil
		}
		rdr = &buf
	}
	req, err := http.NewRequest(method, d.base+path, rdr)
	if err != nil {
		fmt.Printf("%s %s: %v\n", method, path, err)
		d.failed = true
		return nil
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "tutorial-traffic/1")
	if rdr != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	d.sent++
	resp, err := d.client.Do(req)
	if err != nil {
		fmt.Printf("%s %s: request failed: %v\n", method, path, err)
		d.failed = true
		return nil
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != want {
		fmt.Printf("%s %s: got %d, want %d\n", method, path, resp.StatusCode, want)
		d.unexpected++
	}
	return data
}

func main() {
	base := "http://localhost:8080"
	if len(os.Args) > 1 {
		base = os.Args[1]
	}
	file := os.Getenv("TRAFFIC_FILE")
	if file == "" {
		file = "../contract/traffic.json"
	}
	raw, err := os.ReadFile(file)
	if err != nil {
		fmt.Fprintf(os.Stderr, "read %s: %v\n", file, err)
		os.Exit(1)
	}
	var tf trafficFile
	if err := json.Unmarshal(raw, &tf); err != nil || len(tf.Orders) == 0 {
		fmt.Fprintf(os.Stderr, "parse %s: %v\n", file, err)
		os.Exit(1)
	}

	d := &driver{
		base: strings.TrimRight(base, "/"),
		client: &http.Client{
			Timeout: 10 * time.Second,
			// Talk to the base URL directly, even when proxy variables are set.
			Transport: &http.Transport{Proxy: nil},
		},
	}

	d.do("GET", "/healthz", nil, 200)
	for i := 0; i < tf.CatalogCalls; i++ {
		d.do("GET", "/catalog", nil, 200)
	}
	for i := 0; i < tf.OrderRounds; i++ {
		body := d.do("POST", "/orders", tf.Orders[i%len(tf.Orders)], 201)
		var created struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(body, &created); err != nil || created.ID == "" {
			fmt.Printf("POST /orders: no order id in response\n")
			d.failed = true
			continue
		}
		d.do("GET", "/orders/"+created.ID, nil, 200)
		d.do("GET", "/orders/"+created.ID+"/status", nil, 200)
	}
	for i := 0; i < tf.ListCalls; i++ {
		d.do("GET", "/orders", nil, 200)
	}
	for _, br := range tf.BadRequests {
		d.do(br.Method, br.Path, br.Body, br.Expect)
	}

	fmt.Printf("sent %d requests, %d unexpected\n", d.sent, d.unexpected)
	if d.unexpected > 0 || d.failed {
		os.Exit(1)
	}
}
