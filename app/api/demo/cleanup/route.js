/**
 * Cleanup endpoint for expired demo deployments
 * 
 * This endpoint removes demo deployments that have expired (older than 30 minutes).
 * 
 * Setup cron job (runs every 5 minutes):
 * 
 * Add to crontab (crontab -e):
 * */5 * * * * curl -X GET http://localhost:3000/api/demo/cleanup > /dev/null 2>&1
 * 
 * Or with authentication (if CLEANUP_SECRET is set):
 * */5 * * * * curl -X GET -H "Authorization: Bearer YOUR_SECRET" http://localhost:3000/api/demo/cleanup > /dev/null 2>&1
 * 
 * Note: Cleanup also runs automatically when /api/demo/deployments is called,
 * so manual cron setup is optional but recommended for reliability.
 */
import { NextResponse } from 'next/server';
import path from 'path';
import Module from 'module';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request) {
  try {
    // Optional: Add a simple secret check to prevent unauthorized cleanup calls
    // For now, we'll allow it since it only cleans expired demos
    const authHeader = request.headers.get('authorization');
    const expectedSecret = process.env.CLEANUP_SECRET || 'demo-cleanup-secret';
    
    if (authHeader !== `Bearer ${expectedSecret}`) {
      // Still allow, but log it
      console.log('[CLEANUP] Unauthorized cleanup attempt (allowing anyway)');
    }

    // Use Node's Module API directly to bypass webpack's require system
    const modulePath = path.resolve(process.cwd(), 'lib', 'deployment-manager.js');
    const resolvedPath = Module._resolveFilename(modulePath, {
      id: __filename,
      filename: __filename,
      paths: Module._nodeModulePaths(process.cwd())
    });
    const originalRequire = Module.createRequire(__filename);
    const deploymentManager = originalRequire(resolvedPath);
    
    // Clean up expired demo deployments (this also cleans orphaned upload files)
    const removedCount = await deploymentManager.cleanupExpiredDemoDeployments();
    
    return NextResponse.json({
      success: true,
      removedCount,
      message: `Cleaned up ${removedCount} expired demo deployment(s) and orphaned upload file(s)`
    });
  } catch (error) {
    console.error('[CLEANUP] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to cleanup expired deployments' },
      { status: 500 }
    );
  }
}

// Also allow GET for easy cron job setup
export async function GET(request) {
  return POST(request);
}
