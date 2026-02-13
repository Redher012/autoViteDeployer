/**
 * Cleanup endpoint for expired demo deployments.
 * Removes demo deployments that have expired (older than 30 minutes)
 * and orphaned upload files.
 *
 * Cron (every 5 min): add to crontab (crontab -e) a line like:
 *   0,5,10,15,20,25,30,35,40,45,50,55 * * * * curl -s -X GET http://localhost:3000/api/demo/cleanup
 * Cleanup also runs when /api/demo/deployments is called.
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
