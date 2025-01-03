package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"
)

// This is a simple API that returns the distance between two IP addresses.
// It uses the ipstack API to get the latitude and longitude of the IP addresses.
// It then uses the haversine formula to calculate the distance between the two points.
// To use this demo app without Speedscale proxymock, you will need to pass in a valid ipstackAPIKey
// key. You can get one from https://ipstack.com/ (or use the pre-made proxymock snapshots)

// example usage:
// go run main.go <ipstack_api_key>
//
// curl -X GET "http://localhost:8080/get-ip-info?ip1=192.168.1.1&ip2=192.168.1.2"
// {"city":"Tucker","connection_type":"cable","continent_code":"NA","continent_name":"North America","country_code":"US","country_name":"United States","dma":"524","ip":"50.168.198.162","ip_routing_type":"fixed","latitude":33.856021881103516,"location":{"calling_code":"1","capital":"Washington D.C.","country_flag":"https://assets.ipstack.com/flags/us.svg","country_flag_emoji":"🇺🇸","country_flag_emoji_unicode":"U+1F1FA U+1F1F8","geoname_id":4227213,"is_eu":false,"languages":[{"code":"en","name":"English","native":"English"}]},"longitude":-84.21367645263672,"msa":"12060","radius":"46.20358","region_code":"GA","region_name":"Georgia","type":"ipv4","zip":"30084"}
// {"city":"Alpharetta","connection_type":"cable","continent_code":"NA","continent_name":"North America","country_code":"US","country_name":"United States","dma":"524","ip":"174.49.112.125","ip_routing_type":"fixed","latitude":34.08958053588867,"location":{"calling_code":"1","capital":"Washington D.C.","country_flag":"https://assets.ipstack.com/flags/us.svg","country_flag_emoji":"🇺🇸","country_flag_emoji_unicode":"U+1F1FA U+1F1F8","geoname_id":4179574,"is_eu":false,"languages":[{"code":"en","name":"English","native":"English"}]},"longitude":-84.29045867919922,"msa":"12060","radius":"44.94584","region_code":"GA","region_name":"Georgia","type":"ipv4","zip":"30004"}

var ipstackAPIKey string

type response struct {
	Distance float64                `json:"distance"`
	Request1 map[string]interface{} `json:"request1"`
	Request2 map[string]interface{} `json:"request2"`
}

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: go run main.go <ip_address>")
		return
	}
	ipstackAPIKey = os.Args[1]
	http.HandleFunc("/get-ip-info", ipInfoHandler)
	log.Fatal(http.ListenAndServe(":8080", nil))
}

func ipInfoHandler(w http.ResponseWriter, r *http.Request) {
	id2 := r.URL.Query().Get("ip2")
	if id2 == "" {
		http.Error(w, "Second IP address (ip2) is required", http.StatusBadRequest)
		return
	}
	ip := r.URL.Query().Get("ip1")
	if ip == "" {
		http.Error(w, "IP address is required", http.StatusBadRequest)
		return
	}

	result1, err := getIPInfo(w, ip)
	if err != nil {
		http.Error(w, "Failed to get IP info", http.StatusInternalServerError)
		return
	}
	result2, err := getIPInfo(w, id2)
	if err != nil {
		http.Error(w, "Failed to get IP info", http.StatusInternalServerError)
		return
	}

	lat1 := result1["latitude"].(float64)
	long1 := result1["longitude"].(float64)
	lat2 := result2["latitude"].(float64)
	long2 := result2["longitude"].(float64)
	foozibar := haversineDistance(lat1, long1, lat2, long2)

	response := response{
		Distance: foozibar,
		Request1: result1,
		Request2: result2,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)

	fmt.Println(response)

}

func getIPInfo(w http.ResponseWriter, ip string) (map[string]interface{}, error) {
	ipstackURL := fmt.Sprintf("http://api.ipstack.com/%s?access_key=%s", ip, ipstackAPIKey)
	resp, err := http.Get(ipstackURL)
	if err != nil {
		http.Error(w, "Failed to call ipstack API", http.StatusInternalServerError)
		return nil, nil
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, "Failed to read ipstack API response", http.StatusInternalServerError)
		return nil, err
	}

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		http.Error(w, "Failed to parse ipstack API response", http.StatusInternalServerError)
		return nil, err
	}

	return result, nil
}

// HaversineDistance calculates the distance in kilometers between
// two points specified by their latitude and longitude using the
// Haversine formula.
func haversineDistance(lat1, lon1, lat2, lon2 float64) float64 {
	const earthRadius = 6371.0 // Radius of the Earth in km

	// Convert latitudes and longitudes from degrees to radians
	lat1Rad := lat1 * math.Pi / 180.0
	lon1Rad := lon1 * math.Pi / 180.0
	lat2Rad := lat2 * math.Pi / 180.0
	lon2Rad := lon2 * math.Pi / 180.0

	// Differences
	dLat := lat2Rad - lat1Rad
	dLon := lon2Rad - lon1Rad

	// Haversine formula
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1Rad)*math.Cos(lat2Rad)*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))

	return earthRadius * c
}
