// Real dependency for recording and the unmocked control path. No app ledger,
// authentication or resource scheduling is replaced when proxymock stands in.
const http = require('node:http');
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (req.method !== 'GET' || url.pathname !== '/statement-data' || !url.searchParams.get('account')) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ period: '2026-01', entries: [{ description: 'Opening balance', amountCents: 100000 }] }));
});
server.listen(Number(process.env.PORT || 3001), () => console.log(`statement-data listening on :${server.address().port}`));
