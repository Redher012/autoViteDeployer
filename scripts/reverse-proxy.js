/**
 * Reverse Proxy Server for Subdomain Routing
 *
 * Routes subdomain requests to local preview servers (Vite / Next.js).
 * Self-heals: restores preview servers on startup and when a site is unreachable.
 */

const http = require('http');
const { createProxyMiddleware } = require('http-proxy-middleware');
const express = require('express');
const db = require('../lib/db');
const deploymentManager = require('../lib/deployment-manager');

const app = express();
const PORT = process.env.PROXY_PORT || 8080;
const DOMAIN = process.env.DEPLOYMENT_DOMAIN || 'server.appstetic.com';

const restoreInProgress = new Map();

function getDeploymentBySubdomain(subdomain) {
  const stmt = db.prepare('SELECT * FROM deployments WHERE subdomain = ? AND status = ?');
  return stmt.get(subdomain, 'running');
}

function isPortAlive(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}`, (res) => {
      res.resume();
      resolve(res.statusCode === 200 || res.statusCode === 304);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function ensureDeploymentUp(deployment) {
  if (await isPortAlive(deployment.port)) {
    return true;
  }

  const existing = restoreInProgress.get(deployment.id);
  if (existing) {
    await existing;
    return isPortAlive(deployment.port);
  }

  const task = (async () => {
    console.log(`[PROXY] Preview down for ${deployment.subdomain} (port ${deployment.port}), restoring...`);
    await deploymentManager.restorePreviewServer(deployment.id);
    await new Promise((r) => setTimeout(r, 2000));
  })()
    .catch((err) => {
      console.error(`[PROXY] Restore failed for ${deployment.subdomain}: ${err.message}`);
    })
    .finally(() => {
      restoreInProgress.delete(deployment.id);
    });

  restoreInProgress.set(deployment.id, task);
  await task;
  return isPortAlive(deployment.port);
}

app.use(async (req, res, next) => {
  const host = req.headers.host || '';
  const domainPattern = DOMAIN.replace(/\./g, '\\.');
  const subdomainMatch = host.match(new RegExp(`^([^.]+)\\.${domainPattern}`));

  if (!subdomainMatch) {
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

  await ensureDeploymentUp(deployment);

  const proxy = createProxyMiddleware({
    target: `http://localhost:${deployment.port}`,
    changeOrigin: true,
    ws: true,
    logLevel: 'warn',
    onError: (err, req, res) => {
      console.error(`[PROXY] Proxy error for ${subdomain}: ${err.message}`);
      if (!res.headersSent) {
        res.status(502).send(`Preview server unavailable for ${subdomain}. Retrying may restore it automatically.`);
      }
    },
  });

  return proxy(req, res, next);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const server = http.createServer(app);

server.listen(PORT, () => {
  console.log(`Reverse proxy server running on port ${PORT}`);
  console.log(`Domain pattern: *.${DOMAIN}`);

  // Restore all preview servers after deployer platform redeploy (runs outside Next.js bundle)
  setTimeout(() => {
    deploymentManager
      .ensurePreviewServersRunning()
      .then((result) => console.log('[PROXY] Startup preview restore:', JSON.stringify(result)))
      .catch((err) => console.error('[PROXY] Startup preview restore failed:', err.message));
  }, 4000);
});

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => process.exit(0));
});
