#!/usr/bin/env node
/**
 * Restores preview servers after deployer platform redeploy (pm2 restart).
 * Called automatically from deploy.sh — does not require the Next.js app to be running.
 */
const path = require('path');

process.chdir(path.join(__dirname, '..'));

const deploymentManager = require('../lib/deployment-manager');

deploymentManager.ensurePreviewServersRunning()
  .then((result) => {
    console.log('[RESTORE] Preview servers restored:', JSON.stringify(result));
    if (result.failed > 0) {
      process.exit(1);
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error('[RESTORE] Fatal error:', err.message);
    process.exit(1);
  });
