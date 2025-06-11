package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math"
	"net/http"
	"os"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/awserr"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/dynamodb"
	"github.com/aws/aws-sdk-go/service/dynamodb/dynamodbattribute"
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

const port = 8080

var (
	ipstackAPIKey string
	cache         bool
)

type response struct {
	Distance float64        `json:"distance"`
	Request1 map[string]any `json:"request1"`
	Request2 map[string]any `json:"request2"`
}

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: go run main.go <ipstack api key>")
		return
	}
	if len(os.Args) == 3 {
		if os.Args[2] != "--cache" {
			log.Fatal("Invalid argument: ", os.Args[2])
		}

		cache = true
		if err := ensureTableExists(); err != nil {
			log.Fatalf("Failed to ensure table exists: %v\n", err)
		}
	}
	ipstackAPIKey = os.Args[1]
	http.HandleFunc("/get-ip-info", ipInfoHandler)

	log.Printf("Listening on port %d", port)
	log.Fatal(http.ListenAndServe(fmt.Sprintf(":%d", port), nil))
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

	if cache {
		response, err := getResponseFromDynamoDB(ip, id2)
		if err != nil {
			http.Error(w, "Failed to get response from DynamoDB", http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)

		fmt.Println(response)
		return
	}

	result1, err := getIPInfo(w, ip)
	if err != nil {
		return
	}

	// uncomment when you need to record again so you don't get rate limited
	// time.Sleep(time.Second)

	result2, err := getIPInfo(w, id2)
	if err != nil {
		return
	}

	lat1, ok := result1["latitude"].(float64)
	if !ok {
		log.Println("request failed")
		return
	}
	long1 := result1["longitude"].(float64)
	lat2, ok := result2["latitude"].(float64)
	if !ok {
		log.Println("request failed")
		return
	}
	long2 := result2["longitude"].(float64)
	foozibar := haversineDistance(lat1, long1, lat2, long2)

	response := response{
		Distance: foozibar,
		Request1: result1,
		Request2: result2,
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(response)

	log.Println("request successful")

	err = storeResponseInDynamoDB(response)
	if err != nil {
		fmt.Printf("Failed to store response in DynamoDB: %v\n", err)
	}
}

func getResponseFromDynamoDB(ip1, ip2 string) (response, error) {
	// Create a session using the shared config
	sess, err := session.NewSession(&aws.Config{
		Region: aws.String("us-west-2")},
	)
	if err != nil {
		return response{}, fmt.Errorf("failed to create session: %v", err)
	}

	// Create DynamoDB client
	svc := dynamodb.New(sess)

	// Create the key for the GetItem call
	key := ip1 + "|" + ip2
	input := &dynamodb.GetItemInput{
		TableName: aws.String("IPInfoResponses"),
		Key: map[string]*dynamodb.AttributeValue{
			"ID": {
				S: aws.String(key),
			},
		},
	}

	// Get the item from the DynamoDB table
	result, err := svc.GetItem(input)
	if err != nil {
		return response{}, fmt.Errorf("failed to get item from DynamoDB: %v", err)
	}

	if result.Item == nil {
		return response{}, fmt.Errorf("no item found in DynamoDB for key: %s", key)
	}

	// Unmarshal the result into a response struct
	var resp response
	err = dynamodbattribute.UnmarshalMap(result.Item, &resp)
	if err != nil {
		return response{}, fmt.Errorf("failed to unmarshal result: %v", err)
	}

	return resp, nil
}

func storeResponseInDynamoDB(response response) error {
	if !cache {
		return nil
	}

	// Create a session using the shared config
	sess, err := session.NewSession(&aws.Config{
		Region: aws.String("us-west-2")},
	)
	if err != nil {
		return fmt.Errorf("failed to create session: %v", err)
	}

	// Create DynamoDB client
	svc := dynamodb.New(sess)

	// Marshal the response into a map of AttributeValues
	av, err := dynamodbattribute.MarshalMap(response)
	if err != nil {
		return fmt.Errorf("failed to marshal response: %v", err)
	}

	key := response.Request1["ip"].(string) + "|" + response.Request2["ip"].(string)
	av["ID"] = &dynamodb.AttributeValue{
		S: aws.String(key),
	}
	// Create the input for the PutItem call
	input := &dynamodb.PutItemInput{
		Item:      av,
		TableName: aws.String("IPInfoResponses"),
	}

	// Put the item into the DynamoDB table
	_, err = svc.PutItem(input)
	if err != nil {
		return fmt.Errorf("failed to put item in DynamoDB: %v", err)
	}

	return nil
}

func ensureTableExists() error {
	// Create a session using the shared config
	sess, err := session.NewSession(&aws.Config{
		Region: aws.String("us-west-2")},
	)
	if err != nil {
		return fmt.Errorf("failed to create session: %v", err)
	}

	// Create DynamoDB client
	svc := dynamodb.New(sess)

	// Check if the table exists
	_, err = svc.DescribeTable(&dynamodb.DescribeTableInput{
		TableName: aws.String("IPInfoResponses"),
	})
	if err == nil {
		// Table exists
		return nil
	}

	// If the error is not because the table doesn't exist, return the error
	if !isTableNotFoundError(err) {
		return fmt.Errorf("failed to describe table: %v", err)
	}

	// Table does not exist, create it
	_, err = svc.CreateTable(&dynamodb.CreateTableInput{
		TableName: aws.String("IPInfoResponses"),
		AttributeDefinitions: []*dynamodb.AttributeDefinition{
			{
				AttributeName: aws.String("ID"),
				AttributeType: aws.String("S"),
			},
		},
		KeySchema: []*dynamodb.KeySchemaElement{
			{
				AttributeName: aws.String("ID"),
				KeyType:       aws.String("HASH"),
			},
		},
		ProvisionedThroughput: &dynamodb.ProvisionedThroughput{
			ReadCapacityUnits:  aws.Int64(5),
			WriteCapacityUnits: aws.Int64(5),
		},
	})
	if err != nil {
		return fmt.Errorf("failed to create table: %v", err)
	}

	// Wait until the table is created
	err = svc.WaitUntilTableExists(&dynamodb.DescribeTableInput{
		TableName: aws.String("IPInfoResponses"),
	})
	if err != nil {
		return fmt.Errorf("failed to wait for table creation: %v", err)
	}

	return nil
}

func isTableNotFoundError(err error) bool {
	if aerr, ok := err.(awserr.Error); ok {
		if aerr.Code() == dynamodb.ErrCodeResourceNotFoundException {
			return true
		}
	}
	return false
}

func getIPInfo(w http.ResponseWriter, ip string) (map[string]any, error) {
	ipstackURL := fmt.Sprintf("http://api.ipstack.com/%s?access_key=%s", ip, ipstackAPIKey)
	resp, err := http.Get(ipstackURL)
	if err != nil {
		msg := "IP Stack call failed. Have you considered mocking this endpoint with proxymock?"
		http.Error(w, msg, http.StatusInternalServerError)
		return nil, nil
	}
	defer resp.Body.Close()

	if resp != nil && resp.StatusCode == http.StatusTooManyRequests {
		msg := "IP Stack call failed because it was rate limited. Have you considered mocking this endpoint with proxymock?"
		http.Error(w, msg, http.StatusInternalServerError)
		return nil, nil
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		http.Error(w, "Failed to read ipstack API response", http.StatusInternalServerError)
		return nil, err
	}

	var result map[string]any
	if err := json.Unmarshal(body, &result); err != nil {
		http.Error(w, "Failed to parse ipstack API response", http.StatusInternalServerError)
		return nil, err
	}

	// ipstack doesn't care about status codes so we need to read their messsage
	// to see if it's an auth error
	if result != nil {
		if resErr, ok := result["error"]; ok {
			if errMap, ok := resErr.(map[string]any); ok {
				if errType, ok := errMap["type"]; ok && errType.(string) == "invalid_access_key" {
					log.Println("Invalid ipstack API key")
					msg := "IP Stack call failed because the API key is invalid. Have you considered mocking this endpoint with proxymock?"
					http.Error(w, msg, http.StatusInternalServerError)
					return nil, fmt.Errorf("invalid ipstack API key")
				}
			}
		}
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
