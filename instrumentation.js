export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs' || process.env.NODE_ENV !== 'production') {
    return;
  }

  // Backup restore if deploy.sh script did not run (delayed to avoid racing with deploy.sh)
  setTimeout(async () => {
    try {
      const mod = await import('../lib/deployment-manager.js');
      const dm = mod.default || mod;
      await dm.ensurePreviewServersRunning();
    } catch (err) {
      console.error(`[STARTUP] Preview server restore failed: ${err.message}`);
    }
  }, 20000);
}
