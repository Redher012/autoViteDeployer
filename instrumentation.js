export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NODE_ENV !== 'production') {
    return;
  }

  setTimeout(async () => {
    try {
      const deploymentManager = require('./lib/deployment-manager.js');
      await deploymentManager.ensurePreviewServersRunning();
    } catch (err) {
      console.error(`[STARTUP] Preview server restore failed: ${err.message}`);
    }
  }, 8000);
}
