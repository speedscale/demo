const WebSocket = require('ws');

const server = new WebSocket.Server({ port: 8080 });

const messages = [
  'Hello from WebSocket server!',
  'Processing your request...',
  'Data received successfully',
  'Status: OK',
  'heartbeat',
];

server.on('connection', (ws) => {
  console.log('New client connected');

  // Send initial message
  ws.send(JSON.stringify({
    type: 'connection',
    message: 'Welcome to the WebSocket demo server',
    timestamp: new Date().toISOString(),
  }));

  const interval = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      const randomMessage = messages[Math.floor(Math.random() * messages.length)];
      ws.send(JSON.stringify({
        type: 'message',
        data: randomMessage,
        timestamp: new Date().toISOString(),
        clientId: Math.random().toString(36).substr(2, 9),
      }));
    }
  }, 2000);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      console.log('Received:', data);
      ws.send(JSON.stringify({
        type: 'echo',
        original: data,
        timestamp: new Date().toISOString(),
      }));
    } catch (e) {
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid JSON',
        timestamp: new Date().toISOString(),
      }));
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    clearInterval(interval);
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    clearInterval(interval);
  });
});

console.log('WebSocket server running on ws://localhost:8080');
