# Ruby API Client

A Ruby client application that continuously generates traffic to the Ruby API server for testing, demos, and Speedscale recording.

## Overview

The client exercises all API endpoints in a continuous loop:
- **CRUD Operations**: Creates, reads, updates, and deletes tasks
- **Time Conversion API**: Calls the WorldTimeAPI integration endpoint
- **Health Checks**: Periodically verifies server health
- **Random Traffic Pattern**: Sleeps 2-5 seconds between operations for realistic traffic

## Features

- ✅ Continuous traffic generation
- ✅ Exercises all server endpoints
- ✅ Intelligent task tracking (creates, updates, deletes)
- ✅ Rate limit aware (429 handling)
- ✅ Error handling and retry logic
- ✅ Graceful shutdown (SIGINT/SIGTERM)
- ✅ Detailed logging for observability

## Local Testing

### Prerequisites
- Ruby 3.2+
- Running Ruby API server

### Run Locally

```bash
cd client
bundle install

# Point to local server
export SERVER_URL=http://localhost:3000
ruby client.rb

# Or with default (http://ruby-server)
ruby client.rb
```

### Docker Build

```bash
cd client
docker build -t ruby-client:latest .

docker run -e SERVER_URL=http://ruby-server ruby-client:latest
```

## Kubernetes Deployment

The client is automatically included when deploying the full Ruby API stack:

```bash
# Full deployment (includes client)
kubectl apply -k ruby-api/

# Check client logs
kubectl logs -f deployment/ruby-client
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `SERVER_URL` | `http://ruby-server` | Ruby API server URL |

## Traffic Pattern

The client generates the following traffic pattern per iteration:

1. **Health Check** (every 10 iterations)
2. **List Tasks** (every iteration)
3. **Create Task** (every iteration)
4. **Update Task** (if tasks exist)
5. **Time Convert** (every 3 iterations)
6. **Delete Task** (every 7 iterations)

Random sleep between 2-5 seconds after each iteration.

## Example Output

```
Ruby Tasks Client
==================================================
Server URL: http://ruby-server
==================================================

Waiting for server to be ready...
✓ Server is ready!

✓ Server is ready! Starting traffic generation...

=== Iteration 1 ===
  → Listing tasks...
    ✓ Found 5 tasks
  → Creating new task...
    ✓ Created task ID: 6 - Implement new feature #a3f2b1
  → Updating task 3...
    ✓ Updated task 3
  → Sleeping for 4s...

=== Iteration 2 ===
  → Listing tasks...
    ✓ Found 6 tasks
  → Creating new task...
    ✓ Created task ID: 7 - Fix critical bug #d9e8c4
  → Updating task 2...
    ✓ Updated task 2
  → Sleeping for 3s...
```

## Use Cases

### 1. Speedscale Recording
Deploy the full stack to generate realistic traffic for recording:

```bash
# Deploy everything
kubectl apply -k ruby-api/k8s/overlays/full/

# Client continuously generates traffic
# Speedscale records all interactions
```

### 2. Load Testing
Increase client replicas for load testing:

```bash
kubectl scale deployment/ruby-client --replicas=5
```

### 3. Development
Use locally to test API changes:

```bash
# Start server
ruby app.rb

# In another terminal, start client
cd client && ruby client.rb
```

## Troubleshooting

### Client can't connect to server

```bash
# Check server is running
kubectl get pods -l app=ruby-server

# Check server logs
kubectl logs -l app=ruby-server

# Check service
kubectl get svc ruby-server
```

### Client exits immediately

```bash
# Check client logs
kubectl logs -l app=ruby-client

# Likely the server took too long to start (>60 attempts)
```

### Rate limit errors (429)

The client properly handles rate limit errors from the time conversion API. This is expected behavior when calling the WorldTimeAPI endpoint too frequently.

## Development

### Modify Traffic Pattern

Edit `client.rb` to change the traffic pattern:

```ruby
# Change sleep interval
sleep_time = rand(5..10)  # 5-10 seconds instead of 2-5

# Change operation frequency
convert_time if @iteration % 5 == 0  # Every 5 iterations instead of 3
```

### Add New Endpoints

Add methods to the `TasksClient` class:

```ruby
def my_new_endpoint
  puts "  → Calling my endpoint..."
  response = self.class.get('/my-endpoint')
  # Handle response
end
```

Then call it in the `run` loop.

## License

MIT License - Part of Speedscale Demo Applications
