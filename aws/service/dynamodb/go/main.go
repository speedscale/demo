package main

import (
	"fmt"
	"log"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/awserr"
	"github.com/aws/aws-sdk-go/aws/session"
	"github.com/aws/aws-sdk-go/service/dynamodb"
	"github.com/aws/aws-sdk-go/service/dynamodb/dynamodbattribute"
)

type Item struct {
	ID    string `json:"ID"`
	Name  string `json:"name"`
	Value string `json:"value"`
}

func main() {
	sess, err := session.NewSession(&aws.Config{
		Region: aws.String("us-west-2"),
	})
	if err != nil {
		log.Fatalf("Failed to create session: %v", err)
	}
	svc := dynamodb.New(sess)
	tableName := "DemoTable"

	// Create Table
	createTable(svc, tableName)

	totalItems := 10
	// Put all Items
	for i := 1; i <= totalItems; i++ {
		item := Item{
			ID:    fmt.Sprintf("%d", i),
			Name:  fmt.Sprintf("Item%d", i),
			Value: fmt.Sprintf("Value%d", i),
		}
		putItem(svc, tableName, item)
	}

	// Get all Items
	getItems(svc, tableName)

	// Update all Items
	for i := 1; i <= totalItems; i++ {
		updateItem(svc, tableName, fmt.Sprintf("%d", i), fmt.Sprintf("UpdatedValue%d", i))
	}

	// Query Items
	for i := 1; i <= totalItems; i++ {
		queryItems(svc, tableName, fmt.Sprintf("%d", i))
	}

	// Delete all Items
	for i := 1; i <= totalItems; i++ {
		deleteItem(svc, tableName, fmt.Sprintf("%d", i))
	}

	// Delete Table
	deleteTable(svc, tableName)
}

func createTable(svc *dynamodb.DynamoDB, tableName string) {
	input := &dynamodb.CreateTableInput{
		TableName: aws.String(tableName),
		KeySchema: []*dynamodb.KeySchemaElement{
			{
				AttributeName: aws.String("ID"),
				KeyType:       aws.String("HASH"),
			},
		},
		AttributeDefinitions: []*dynamodb.AttributeDefinition{
			{
				AttributeName: aws.String("ID"),
				AttributeType: aws.String("S"),
			},
		},
		ProvisionedThroughput: &dynamodb.ProvisionedThroughput{
			ReadCapacityUnits:  aws.Int64(5),
			WriteCapacityUnits: aws.Int64(5),
		},
	}

	_, err := svc.CreateTable(input)
	if err != nil {
		if aerr, ok := err.(awserr.Error); ok && aerr.Code() == dynamodb.ErrCodeResourceInUseException {
			fmt.Printf("Table %s already exists\n", tableName)
			return
		}
		log.Fatalf("Failed to create table: %v", err)
	}
	fmt.Println("Table created successfully")
}

func putItem(svc *dynamodb.DynamoDB, tableName string, item Item) {
	av, err := dynamodbattribute.MarshalMap(item)
	if err != nil {
		log.Fatalf("Failed to marshal item: %v", err)
	}

	input := &dynamodb.PutItemInput{
		TableName: aws.String(tableName),
		Item:      av,
	}

	_, err = svc.PutItem(input)
	if err != nil {
		log.Fatalf("Failed to put item: %v", err)
	}
	fmt.Println("Item inserted successfully")
}

func getItems(svc *dynamodb.DynamoDB, tableName string) {
	input := &dynamodb.ScanInput{
		TableName: aws.String(tableName),
	}

	result, err := svc.Scan(input)
	if err != nil {
		log.Fatalf("Failed to scan items: %v", err)
	}

	items := []Item{}
	err = dynamodbattribute.UnmarshalListOfMaps(result.Items, &items)
	if err != nil {
		log.Fatalf("Failed to unmarshal items: %v", err)
	}
	fmt.Printf("Retrieved %d items:\n", len(items))
	for _, item := range items {
		fmt.Printf("%+v\n", item)
	}
}

func updateItem(svc *dynamodb.DynamoDB, tableName, id, newValue string) {
	input := &dynamodb.UpdateItemInput{
		TableName: aws.String(tableName),
		Key: map[string]*dynamodb.AttributeValue{
			"ID": {S: aws.String(id)},
		},
		UpdateExpression: aws.String("set #v = :val"),
		ExpressionAttributeNames: map[string]*string{
			"#v": aws.String("Value"),
		},
		ExpressionAttributeValues: map[string]*dynamodb.AttributeValue{
			":val": {S: aws.String(newValue)},
		},
		ReturnValues: aws.String("UPDATED_NEW"),
	}

	_, err := svc.UpdateItem(input)
	if err != nil {
		log.Fatalf("Failed to update item: %v", err)
	}
	fmt.Println("Item updated successfully")
}

func queryItems(svc *dynamodb.DynamoDB, tableName, id string) {
	input := &dynamodb.QueryInput{
		TableName:              aws.String(tableName),
		KeyConditionExpression: aws.String("ID = :id"),
		ExpressionAttributeValues: map[string]*dynamodb.AttributeValue{
			":id": {S: aws.String(id)},
		},
	}

	result, err := svc.Query(input)
	if err != nil {
		log.Fatalf("Failed to query items: %v", err)
	}

	fmt.Printf("Query result: %+v\n", result.Items)
}

func deleteItem(svc *dynamodb.DynamoDB, tableName, id string) {
	input := &dynamodb.DeleteItemInput{
		TableName: aws.String(tableName),
		Key: map[string]*dynamodb.AttributeValue{
			"ID": {S: aws.String(id)},
		},
	}

	_, err := svc.DeleteItem(input)
	if err != nil {
		log.Fatalf("Failed to delete item: %v", err)
	}
	fmt.Println("Item deleted successfully")
}

func deleteTable(svc *dynamodb.DynamoDB, tableName string) {
	input := &dynamodb.DeleteTableInput{
		TableName: aws.String(tableName),
	}

	_, err := svc.DeleteTable(input)
	if err != nil {
		log.Fatalf("Failed to delete table: %v", err)
	}
	fmt.Println("Table deleted successfully")
}
