# RabbitMQ Demo Application

This demo application demonstrates RabbitMQ message consumption patterns that can be recorded by Speedscale. It consists of a producer that sends messages and a consumer that receives and acknowledges them.

## Overview

The demo includes:
- **Consumer**: A Go application that connects to RabbitMQ, subscribes to a queue, and processes messages
- **Producer**: A Go application that sends test messages to the queue
- **Docker Compose**: Configuration to run RabbitMQ locally with management UI

This setup allows you to generate realistic RabbitMQ traffic that Speedscale can capture and replay according to the [RabbitMQ Replay Guide](../../docs/guides/rabbitmq.md).

## Prerequisites

- [Docker](https://www.docker.com/get-started) and Docker Compose installed
- [Go 1.23+](https://golang.org/dl/) installed
- [speedctl](https://docs.speedscale.com/reference/glossary/#speedctl) installed (for capturing traffic)

## Quick Start

### 1. Start RabbitMQ

Using Docker Compose (recommended):

```bash
cd demos/rabbitmq
docker-compose up -d
```

Or using a standalone Docker command:

```bash
docker run -d --name rabbitmq-demo \
  -p 5672:5672 \
  -p 15672:15672 \
  -h rabbitmq-demo \
  rabbitmq:4-management
```

Verify RabbitMQ is running:

```bash
docker ps | grep rabbitmq
```

### 2. Access RabbitMQ Management UI

Open your browser and navigate to: http://localhost:15672

- **Username**: `guest`
- **Password**: `guest`

You can use this interface to monitor queues, exchanges, and messages in real-time.

### 3. Run the Consumer

In a new terminal:

```bash
cd consumer
go mod download
go run main.go
```

You should see output like:

```
Connected to RabbitMQ and declared queue: demo-queue
Waiting for messages. To exit press CTRL+C
```

### 4. Run the Producer

In another terminal:

```bash
cd producer
go mod download
go run main.go
```

The producer will send 10 messages, and you should see output like:

```
Connected to RabbitMQ and declared queue: demo-queue
Published: Message #1 - timestamp: 2025-12-13T12:00:00Z
Published: Message #2 - timestamp: 2025-12-13T12:00:01Z
...
Finished sending messages
```

The consumer terminal will show messages being received and acknowledged:

```
Received message: Message #1 - timestamp: 2025-12-13T12:00:00Z
Message acknowledged
Received message: Message #2 - timestamp: 2025-12-13T12:00:01Z
Message acknowledged
...
```

## Using with Speedscale

### Recording Traffic

To capture the RabbitMQ traffic with Speedscale, you'll need to configure your Speedscale sidecar or forwarder to intercept traffic on port 5672. The captured traffic will show the complete AMQP protocol flow including:

- Connection and channel setup
- Queue declarations
- Message subscriptions (Basic.Consume)
- Message deliveries (Basic.Deliver)
- Acknowledgements (Basic.Ack)

### Creating a Snapshot

Follow the [Creating a Snapshot guide](../../docs/guides/creating-a-snapshot.md) to capture the traffic from the consumer application.

### Replaying Traffic

Once you have a snapshot, you can extract the messages and replay them using the [RabbitMQ Replay Guide](../../docs/guides/rabbitmq.md):

```bash
# Extract message bodies from the snapshot
speedctl extract data <snapshot-id> \
  --path amqp.method.basic.deliver.body \
  --filter='(command IS "Basic.Deliver")'

# Use the replay script from the guide to publish messages back to RabbitMQ
```

## Customization

### Changing the Queue Name

Edit the `queueName` variable in both `consumer/main.go` and `producer/main.go`:

```go
queueName := "your-custom-queue-name"
```

### Adjusting Message Rate

In `producer/main.go`, modify the sleep duration:

```go
time.Sleep(1 * time.Second) // Change this value
```

### Connection String

To connect to a different RabbitMQ instance, update the connection string in both applications:

```go
conn, err := amqp.Dial("amqp://user:pass@hostname:5672/vhost")
```

## Cleanup

Stop and remove the RabbitMQ container:

```bash
docker-compose down

# To also remove the data volume:
docker-compose down -v
```

## Troubleshooting

### Connection Refused

If you see "connection refused" errors:

1. Verify RabbitMQ is running: `docker ps | grep rabbitmq`
2. Check RabbitMQ logs: `docker logs rabbitmq-demo`
3. Ensure ports 5672 and 15672 are not in use by another service

### Messages Not Being Consumed

1. Check the consumer is running and connected
2. Verify the queue name matches in both producer and consumer
3. Check the RabbitMQ Management UI to see if messages are in the queue

### Go Module Issues

If you encounter module issues:

```bash
cd consumer
go mod tidy
go mod download
```

## Architecture

This demo follows the standard RabbitMQ communication pattern:

```
Producer → RabbitMQ Queue → Consumer
             (port 5672)
```

The consumer maintains a persistent connection with:
1. Connection establishment
2. Channel creation
3. Queue declaration
4. Consumer registration (Basic.Consume)
5. Message delivery (Basic.Deliver)
6. Manual acknowledgement (Basic.Ack)

This pattern generates the exact traffic flow that Speedscale captures and can replay according to the guide.

## References

- [Official RabbitMQ Documentation](https://www.rabbitmq.com/docs/)
- [RabbitMQ Docker Hub](https://hub.docker.com/_/rabbitmq)
- [rabbitmq/amqp091-go Go Client](https://github.com/rabbitmq/amqp091-go)
- [Speedscale RabbitMQ Replay Guide](../../docs/guides/rabbitmq.md)
