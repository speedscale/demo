const WebSocket = require('ws');

// Default: direct to app. With `proxymock record --app-port 8080`, connect via
// proxymock's inbound port (printed in the terminal, often 4143), e.g.:
//   WS_URL=ws://localhost:4143 npm run client
const url = process.env.WS_URL || 'ws://localhost:8080';
const ws = new WebSocket(url);

let messageCount = 0;

ws.on('open', () => {
  console.log('Connected to WebSocket server');

  // Send a message every 5 seconds
  const sendInterval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      messageCount++;
      ws.send(JSON.stringify({
        type: 'client_message',
        content: `Message #${messageCount} from client`,
        timestamp: new Date().toISOString(),
      }));
    }
  }, 5000);

  // Handle server close
  ws.on('close', () => {
    clearInterval(sendInterval);
  });
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log('Received:', message.type, '-', message.data || message.original?.content || message.message);
  } catch (e) {
    console.log('Received raw:', data.toString());
  }
});

ws.on('error', (error) => {
  console.error('WebSocket error:', error.message);
});

ws.on('close', () => {
  console.log('Disconnected from server');
  process.exit(0);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down client...');
  ws.close();
});
