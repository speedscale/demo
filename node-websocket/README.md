# WebSocket Demo Application

A simple WebSocket demo application suitable for testing with proxymock. This application generates ongoing WebSocket traffic that can be captured, replayed, and mocked using Speedscale's proxymock tool.

## Components

- **server.js**: WebSocket server that accepts connections and sends periodic messages
- **client.js**: WebSocket client that connects to the server and sends periodic messages

## Setup

```bash
npm install
```

## Running the Application

### Start the Server
```bash
npm start
```

The server will start on `ws://localhost:8080`.

### Start the Client
In a separate terminal:
```bash
npm run client
```

The client will connect to the server and exchange messages every 2-5 seconds.

## Proxymock Traffic Capture

Proxymock captures traffic by running your application through a proxy. Here's how to turn traffic capture on and off:

### Prerequisites
Install proxymock:
```bash
brew install speedscale/tap/proxymock  # macOS
```
Or follow the full installation guide at https://docs.speedscale.com/proxymock/getting-started/installation/

### Turn ON Traffic Capture (Recording)

1. Start proxymock in record mode, launching the server through the proxy:
```bash
proxymock record --app-port 8080 -- npm start
```

2. In another terminal, start the client **through proxymock’s inbound port** (not `8080`). Proxymock prints this when it starts—for example: `recording inbound traffic sent to port 4143 (forwarded to your app on port 8080)`.
```bash
WS_URL=ws://localhost:4143 npm run client
```
Adjust the port if your run shows a different inbound listener. If you connect to `ws://localhost:8080` instead, traffic goes straight to the app and **will not** be recorded as inbound.

3. Let traffic flow for a few minutes to capture various message patterns.

4. Stop proxymock with Ctrl+C. Captured traffic is saved to a `proxymock/snapshot-<uuid>/` directory.

### Turn OFF Traffic Capture / Run Without Proxy

Simply run the application normally without proxymock:
```bash
npm start
```
And start the client in another terminal:
```bash
npm run client
```

No traffic will be captured - the application will communicate directly.

### Replay Captured Traffic

To replay previously recorded traffic:
```bash
proxymock replay --in ./proxymock/snapshot-<uuid> --test-against ws://localhost:8080
```

### Start Mock Server

To start a mock server that responds with recorded responses:
```bash
proxymock mock --in ./proxymock/snapshot-<uuid> --out ./proxymock/mocked
```

Then replay against the mock server:
```bash
proxymock replay --in ./proxymock/snapshot-<uuid> --test-against http://localhost:4143
```

### Inspect Captured Traffic

Browse captured traffic using the proxymock TUI:
```bash
proxymock inspect
```

## Traffic Behavior

The demo generates the following ongoing traffic:
- Server sends messages every 2 seconds (welcome message, random status updates, heartbeats)
- Client sends messages every 5 seconds (numbered messages)
- Each message includes timestamps and metadata for realistic traffic patterns

## Environment Variables

For proxymock operations, you may need:
```bash
export SPEEDSCALE_API_KEY=your_api_key
```

## Use Cases

- **Regression Testing**: Capture baseline traffic, make code changes, replay to detect behavior changes
- **Dependency Mocking**: Mock the WebSocket server to test clients without a real server
- **Load Testing**: Replay captured traffic at scale to test server performance
- **CI/CD Integration**: Add replay tests to your pipeline to catch breaking changes
