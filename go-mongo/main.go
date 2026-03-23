package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/v2/bson"
	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/readconcern"
	"go.mongodb.org/mongo-driver/v2/mongo/writeconcern"
)

const (
	dbName   = "data-service-performance-test_karate-test-data-service"
	collName = "ImmortaleIntegrationTestApp__IntegrationTestCase"
)

var db *mongo.Database

func main() {
	uri := os.Getenv("MONGODB_URI")
	if uri == "" {
		uri = "mongodb://testuser:testpass@localhost:27017/admin?authSource=admin&directConnection=true"
	}

	log.Printf("connecting to MongoDB: %s", uri)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	client, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		log.Fatalf("MongoDB connect error: %v", err)
	}

	if err := client.Ping(ctx, nil); err != nil {
		log.Fatalf("MongoDB ping error: %v", err)
	}
	log.Println("MongoDB ping successful")

	db = client.Database(dbName)

	// Batch mode: run a single aggregate query and exit. Used by local test scripts
	// where we just need to verify the MongoDB mock serves data without running a
	// full HTTP server.
	if os.Getenv("BATCH_MODE") == "1" {
		runBatch(ctx)
		return
	}

	mux := http.NewServeMux()

	// Match the exact URL patterns from the captured traffic.
	// The {tid} segment is the tenant/isolation-ID ("karate-test-data-service").
	mux.HandleFunc("POST /v3/{tid}/data", handleCreate)
	mux.HandleFunc("GET /v3/{tid}/data/{id}", handleGetByID)
	mux.HandleFunc("GET /v3/{tid}/data-pages/{class}", handleDataPage)
	mux.HandleFunc("DELETE /v3/{tid}/data/{id}", handleDelete)

	log.Println("listening on :8080")
	if err := http.ListenAndServe(":8080", mux); err != nil {
		log.Fatalf("HTTP server error: %v", err)
	}
}

// handleCreate inserts a document into MongoDB. Matches POST /v3/{tid}/data.
func handleCreate(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	coll := db.Collection(collName)

	var body map[string]any
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	doc := bson.M{
		"_id":     fmt.Sprintf("generated-%d", time.Now().UnixNano()),
		"version": 1,
		"type":    collName,
		"data":    body["data"],
		"headers": bson.M{
			"Model-ID":             r.Header.Get("Model-Id"),
			"Model-Isolation-ID":   r.Header.Get("Model-Isolation-Id"),
			"AppData-Isolation-ID": r.PathValue("tid"),
		},
	}

	if _, err := coll.InsertOne(ctx, doc); err != nil {
		log.Printf("insert error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(bson.M{"data": body["data"], "version": 1})
}

// handleGetByID runs an aggregate matching by _id. Matches GET /v3/{tid}/data/{id}.
func handleGetByID(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := r.PathValue("id")
	coll := db.Collection(collName)

	opts := options.Aggregate().
		SetAllowDiskUse(true).
		SetBatchSize(64)
	coll = coll.Clone(options.Collection().SetReadConcern(readconcern.Majority()))

	pipeline := bson.A{
		bson.D{{Key: "$match", Value: bson.D{{Key: "_id", Value: id}}}},
		bson.D{{Key: "$limit", Value: 500}},
	}

	cursor, err := coll.Aggregate(ctx, pipeline, opts)
	if err != nil {
		log.Printf("aggregate error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer cursor.Close(ctx)

	var results []bson.M
	if err := cursor.All(ctx, &results); err != nil {
		log.Printf("cursor error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	if len(results) == 0 {
		http.Error(w, "not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(results[0])
}

// handleDataPage runs an aggregate matching by query params. Matches GET /v3/{tid}/data-pages/{class}.
func handleDataPage(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	className := r.PathValue("class")

	// Strip the suffix (ByUrgency, ByID) to get the base collection name.
	baseClass := className
	for _, suffix := range []string{"ByUrgency", "ByID", "ByStatus"} {
		baseClass = strings.TrimSuffix(baseClass, suffix)
	}
	coll := db.Collection(baseClass)

	opts := options.Aggregate().
		SetAllowDiskUse(true).
		SetBatchSize(64)
	coll = coll.Clone(options.Collection().SetReadConcern(readconcern.Majority()))

	// Build $match from query parameters, mapping to the document's data field.
	match := bson.D{}
	for key, values := range r.URL.Query() {
		if len(values) == 0 {
			continue
		}
		switch key {
		case "ID":
			match = append(match, bson.E{Key: "_id", Value: values[0]})
		case "Urgency":
			match = append(match, bson.E{Key: "data.PegaPlatform__Urgency", Value: 1})
		default:
			match = append(match, bson.E{Key: "data.PegaPlatform__" + key, Value: values[0]})
		}
	}

	pipeline := bson.A{
		bson.D{{Key: "$match", Value: match}},
		bson.D{{Key: "$limit", Value: 5000}},
	}

	cursor, err := coll.Aggregate(ctx, pipeline, opts)
	if err != nil {
		log.Printf("aggregate error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer cursor.Close(ctx)

	var results []bson.M
	if err := cursor.All(ctx, &results); err != nil {
		log.Printf("cursor error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/stream+json")
	enc := json.NewEncoder(w)
	for _, doc := range results {
		enc.Encode(doc)
	}
}

// handleDelete removes a document by _id. Matches DELETE /v3/{tid}/data/{id}.
func handleDelete(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	id := r.PathValue("id")
	coll := db.Collection(collName)

	wc := writeconcern.Majority()
	coll = coll.Clone(options.Collection().SetWriteConcern(wc))

	filter := bson.D{
		{Key: "$and", Value: bson.A{
			bson.D{{Key: "_id", Value: id}},
			bson.D{{Key: "version", Value: 1}},
		}},
	}

	if _, err := coll.DeleteOne(ctx, filter); err != nil {
		log.Printf("delete error: %v", err)
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// runBatch connects, runs a single aggregate, and exits. For local proxymock mock testing.
func runBatch(ctx context.Context) {
	coll := db.Collection(collName)

	log.Println("running aggregate...")
	pipeline := bson.A{bson.D{{Key: "$limit", Value: 5}}}
	cursor, err := coll.Aggregate(ctx, pipeline)
	if err != nil {
		log.Fatalf("aggregate error: %v", err)
	}
	defer cursor.Close(ctx)

	var results []bson.M
	if err := cursor.All(ctx, &results); err != nil {
		log.Fatalf("cursor error: %v", err)
	}
	log.Printf("aggregate returned %d documents", len(results))
	for i, doc := range results {
		if i >= 3 {
			log.Printf("  ... and %d more", len(results)-3)
			break
		}
		log.Printf("  doc[%d]: %v", i, doc)
	}
	fmt.Println("DONE - all queries completed successfully")
}
