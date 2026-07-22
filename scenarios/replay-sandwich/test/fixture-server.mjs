import http from 'node:http';

const port = Number(process.env.PORT || 18080);

const server = http.createServer((request, response) => {
  response.setHeader('content-type', 'application/json');

  if (request.url === '/healthz') {
    response.end(JSON.stringify({ health: 'y' }));
    return;
  }

  if (request.url === '/models') {
    response.end(JSON.stringify([{ id: 'speedscale/replay-sandwich' }]));
    return;
  }

  response.statusCode = 404;
  response.end(JSON.stringify({ error: 'not found' }));
});

server.listen(port, '127.0.0.1', () => {
  console.log(`fixture server listening on ${port}`);
});
