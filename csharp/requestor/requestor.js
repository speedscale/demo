const http = require('http');
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
  // agent: agent,  // Use the proxy agent
};

const sendRequest = (id) => {
  const req = http.request(options, (res) => {
    let data = '';

    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      console.log(`Response ${id}:`, data);
    });
  });

  req.on('error', (e) => {
    console.error(`Error in request ${id}: ${e.message}`);
  });

  req.end();
};

// Launch 100 requests
for (let i = 1; i <= 100; i++) {
  sendRequest(i);
}
