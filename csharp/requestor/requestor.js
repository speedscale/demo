// const http = require('https');
const httpRequest = require('http');
// const httpRequest = require('https');
// const { HttpProxyAgent } = require('http-proxy-agent');

// Proxy configuration (replace with your proxy's address)
// const proxyUrl = 'localhost:4143'; // Change this to your proxy address
// const agent = new HttpProxyAgent(proxyUrl);

const options = {
  hostname: 'localhost',
  port: 4143,
  path: '/weatherforecast',
  method: 'GET',
  headers: {
    Accept: '*/*',
  },
  // rejectUnauthorized: false,
  // agent: agent,  // Use the proxy agent
};

const sendRequest = (id) => {
  const req = httpRequest.request(options, (res) => {
    console.log(`Status Code: ${res.statusCode}`);

    let responseData = '';

    res.on('data', (chunk) => {
      responseData += chunk.toString();
      console.log(`Received chunk: ${chunk.length} bytes`);
    });

    res.on('end', () => {
      console.log(`Request ${id} completed. Final Response:`, responseData);
    });

    res.on('error', (err) => {
      console.error(`Error in response for Request ${id}: ${err.message}`);
    });
  });

  req.on('error', (e) => {
    console.error(`Request ${id} encountered an error: ${e.message}`);
  });

  // Add a timeout to prevent hanging requests
  req.setTimeout(5000, () => {
    console.error(`Request ${id} timed out.`);
    req.abort();
  });

  // Send the request body (if any) and finalize it
  req.end();

};

// Launch 100 requests
for (let i = 1; i <= 100; i++) {
  sendRequest(i);
}
