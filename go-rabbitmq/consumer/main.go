package main

import (
	"log"
	"time"

	amqp "github.com/rabbitmq/amqp091-go"
)

func main() {
	// Connect to RabbitMQ
	conn, err := amqp.Dial("amqp://guest:guest@localhost:15671/")
	if err != nil {
		log.Fatalf("Failed to connect to RabbitMQ: %v", err)
	}
	defer conn.Close()

	// Create a channel
	ch, err := conn.Channel()
	if err != nil {
		log.Fatalf("Failed to open channel: %v", err)
	}
	defer ch.Close()

	// Declare a queue (idempotent)
	queueName := "demo-queue"
	q, err := ch.QueueDeclare(
		queueName, // name
		true,      // durable
		false,     // delete when unused
		false,     // exclusive
		false,     // no-wait
		nil,       // arguments
	)
	if err != nil {
		log.Fatalf("Failed to declare queue: %v", err)
	}

	log.Printf("Connected to RabbitMQ and declared queue: %s", q.Name)

	// Set QoS (prefetch count)
	err = ch.Qos(
		1,     // prefetch count
		0,     // prefetch size
		false, // global
	)
	if err != nil {
		log.Fatalf("Failed to set QoS: %v", err)
	}

	// Register a consumer
	msgs, err := ch.Consume(
		q.Name, // queue
		"",     // consumer tag
		false,  // auto-ack (set to false for manual ack)
		false,  // exclusive
		false,  // no-local
		false,  // no-wait
		nil,    // args
	)
	if err != nil {
		log.Fatalf("Failed to register consumer: %v", err)
	}

	log.Println("Waiting for messages. To exit press CTRL+C")

	// Process messages
	forever := make(chan bool)
	go func() {
		for d := range msgs {
			log.Printf("Received message: %s", d.Body)

			// Simulate processing time
			time.Sleep(500 * time.Millisecond)

			// Acknowledge the message
			err := d.Ack(false)
			if err != nil {
				log.Printf("Failed to acknowledge message: %v", err)
			} else {
				log.Println("Message acknowledged")
			}
		}
	}()

	<-forever
}
