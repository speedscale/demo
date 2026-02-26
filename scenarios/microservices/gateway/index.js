/**
 * Gateway for Java + .NET + Node + PHP microservices scenario.
 * Proxies /java/* -> Java, /csharp/* -> .NET, /node/* -> Node, /php/* -> PHP.
 */
import express from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

const PORT = Number(process.env.PORT) || 8080;
const JAVA_URL = process.env.JAVA_SERVICE_URL || 'http://java-server:8080';
const CSHARP_URL = process.env.CSHARP_SERVICE_URL || 'http://csharp-weather:8080';
const NODE_URL = process.env.NODE_SERVICE_URL || 'http://node-server:3000';
const PHP_URL = process.env.PHP_SERVICE_URL || 'http://php-server:80';

const app = express();

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    gateway: 'ok',
    services: ['java', 'csharp', 'node', 'php'],
    ts: new Date().toISOString(),
  });
});

app.use(
  '/java',
  createProxyMiddleware({
    target: JAVA_URL,
    changeOrigin: true,
    pathRewrite: { '^/java': '' },
  })
);

app.use(
  '/csharp',
  createProxyMiddleware({
    target: CSHARP_URL,
    changeOrigin: true,
    pathRewrite: { '^/csharp': '' },
  })
);

app.use(
  '/node',
  createProxyMiddleware({
    target: NODE_URL,
    changeOrigin: true,
    pathRewrite: { '^/node': '' },
  })
);

app.use(
  '/php',
  createProxyMiddleware({
    target: PHP_URL,
    changeOrigin: true,
    pathRewrite: { '^/php': '' },
  })
);

app.listen(PORT, () => {
  console.log(`Gateway listening on port ${PORT}`);
  console.log(`  /health     - gateway health`);
  console.log(`  /java/*     -> ${JAVA_URL}`);
  console.log(`  /csharp/*   -> ${CSHARP_URL}`);
  console.log(`  /node/*     -> ${NODE_URL}`);
  console.log(`  /php/*      -> ${PHP_URL}`);
});
