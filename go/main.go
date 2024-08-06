package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
)

// SpaceXAPIResponse represents the structure of the SpaceX API response.
type SpaceXAPIResponse struct {
	Name      string `json:"name"`
	FlightNum int    `json:"flight_number"`
	// Add other fields you want to display
}

// handleRequest handles incoming HTTP requests to the /spacex endpoint.
func handleRequest(w http.ResponseWriter, r *http.Request) {
	// Make a request to the SpaceX API
	response, err := http.Get("https://api.spacexdata.com/v4/launches/latest")
	if err != nil {
		http.Error(w, fmt.Sprintf("Failed to fetch SpaceX data: %s", err), http.StatusInternalServerError)
		return
	}
	defer response.Body.Close()

	// Read and parse the response body
	body, err := ioutil.ReadAll(response.Body)
	if err != nil {
		http.Error(w, "Failed to read response", http.StatusInternalServerError)
		return
	}

	var spacexResponse SpaceXAPIResponse
	err = json.Unmarshal(body, &spacexResponse)
	if err != nil {
		http.Error(w, "Failed to parse SpaceX data", http.StatusInternalServerError)
		return
	}

	// Convert the response to JSON and send it back to the client
	responseJSON, err := json.Marshal(spacexResponse)
	if err != nil {
		http.Error(w, "Failed to encode response", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(responseJSON)
}

func main() {
	// Define the /spacex endpoint
	http.HandleFunc("/spacex", handleRequest)

	// Start the HTTP server
	port := ":8080"
	fmt.Printf("Server is running on http://localhost%s/spacex\n", port)
	log.Fatal(http.ListenAndServe(port, nil))
}
