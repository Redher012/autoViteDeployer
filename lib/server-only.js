/**
 * Server-only module loader
 * This file ensures server-only modules are not bundled for the client
 */
import 'server-only';

export function getDeploymentManager() {
  // Use require() at runtime, not at module load time
  // This prevents Next.js from trying to bundle the CommonJS modules
  return require('./deployment-manager');
}
