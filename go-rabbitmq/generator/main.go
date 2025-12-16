package main

import (
	"encoding/base64"
	"encoding/csv"
	"fmt"
	"io"
	"os"

	amqp "github.com/rabbitmq/amqp091-go"
)

func main() {
	if err := do(); err != nil {
		panic(err)
	}
}

func do() error {
	// Open CSV file
	file, err := os.Open("/Users/matthewleray/.speedscale/data/userdata/38067e49-3fbc-49f2-85bd-cd9475304804.csv")
	if err != nil {
		return fmt.Errorf("failed to open CSV file: %w", err)
	}
	defer file.Close()

	// Create CSV reader
	reader := csv.NewReader(file)

	// Skip header row
	if _, err := reader.Read(); err != nil {
		return fmt.Errorf("failed to read CSV header: %w", err)
	}

	// Connect to RabbitMQ
	conn, err := amqp.Dial("amqp://guest:guest@localhost:5672/")
	if err != nil {
		return fmt.Errorf("failed to connect to RabbitMQ: %w", err)
	}
	defer conn.Close()

	// Create a channel
	ch, err := conn.Channel()
	if err != nil {
		return fmt.Errorf("failed to open channel: %w", err)
	}
	defer ch.Close()

	// Iterate over CSV rows
	for {
		row, err := reader.Read()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fmt.Errorf("failed to read CSV row: %w", err)
		}

		// Using the first column only
		messageBody := row[0]
		bodyString, err := base64.StdEncoding.DecodeString(messageBody)
		if err != nil {
			return fmt.Errorf("failed to decode message body: %w", err)
		}

		// Publish message to RabbitMQ
		err = ch.Publish(
			"",           // exchange (use default)
			"demo-queue", // routing key (your queue name)
			false,        // mandatory
			false,        // immediate
			amqp.Publishing{
				ContentType: "text/plain",
				Body:        []byte(bodyString),
			},
		)
		if err != nil {
			return fmt.Errorf("failed to publish message to RabbitMQ: %w", err)
		}
	}

	return nil
}
