/**
 * Reverse Proxy Server for Subdomain Routing
 * 
 * This script creates a reverse proxy server that routes subdomain requests
 * to the appropriate local port where Vite preview servers are running.
 * 
 * Usage:
 *   node scripts/reverse-proxy.js
 * 
 * Make sure to configure your DNS to point *.server.appstetic.com to your server IP
 * and configure Nginx or Apache to proxy requests to this server on port 8080
 */

const http = require('http');
const { createProxyMiddleware } = require('http-proxy-middleware');
const express = require('express');
const db = require('../lib/db');

const app = express();
const PORT = process.env.PROXY_PORT || 8080;
const DOMAIN = process.env.DEPLOYMENT_DOMAIN || 'server.appstetic.com';

// Get deployment by subdomain
function getDeploymentBySubdomain(subdomain) {
  const stmt = db.prepare('SELECT * FROM deployments WHERE subdomain = ? AND status = ?');
  return stmt.get(subdomain, 'running');
}

// Middleware to extract subdomain and route to appropriate port
app.use((req, res, next) => {
  const host = req.headers.host || '';
  
  // Extract subdomain from hostname
  // Format: [subdomain].server.appstetic.com (configurable via DEPLOYMENT_DOMAIN)
  const domainPattern = DOMAIN.replace(/\./g, '\\.');
  const subdomainMatch = host.match(new RegExp(`^([^.]+)\\.${domainPattern}`));
  
  if (!subdomainMatch) {
    // If no subdomain match, serve the main Next.js app
    return next();
  }
  
  const subdomain = subdomainMatch[1];
  const deployment = getDeploymentBySubdomain(subdomain);
  
  if (!deployment || !deployment.port) {
    res.status(404).send(`
      <html>
        <body>
          <h1>404 - Deployment Not Found</h1>
          <p>No active deployment found for subdomain: ${subdomain}</p>
        </body>
      </html>
    `);
    return;
  }
  
  // Proxy to the Vite preview server
  const proxy = createProxyMiddleware({
    target: `http://localhost:${deployment.port}`,
    changeOrigin: true,
    ws: true, // Enable websocket proxying
    logLevel: 'info',
  });
  
  proxy(req, res, next);
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`Reverse proxy server running on port ${PORT}`);
  console.log(`Configure your DNS to point *.${DOMAIN} to this server`);
  console.log(`Then configure Nginx/Apache to proxy requests to localhost:${PORT}`);
  console.log(`Domain pattern: *.${DOMAIN}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});
