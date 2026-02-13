import { NextResponse } from 'next/server';
import path from 'path';
import Module from 'module';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET() {
  try {
    // Use Node's Module API directly to bypass webpack's require system
    const modulePath = path.resolve(process.cwd(), 'lib', 'deployment-manager.js');
    const resolvedPath = Module._resolveFilename(modulePath, {
      id: __filename,
      filename: __filename,
      paths: Module._nodeModulePaths(process.cwd())
    });
    const originalRequire = Module.createRequire(__filename);
    const deploymentManager = originalRequire(resolvedPath);
    
    // Clean up expired demo deployments first
    await deploymentManager.cleanupExpiredDemoDeployments();
    
    // Get all deployments (both demo and user projects)
    const deployments = deploymentManager.getAllDeployments();
    
    // Mark which deployments are demo vs user-owned
    const deploymentsWithFlags = deployments.map(deployment => ({
      ...deployment,
      is_demo: deployment.is_demo === 1,
      is_expired: deployment.expires_at && new Date(deployment.expires_at) < new Date(),
      can_manage: deployment.is_demo === 1 // Demo users can only manage their own demo projects
    }));

    return NextResponse.json({
      deployments: deploymentsWithFlags
    });
  } catch (error) {
    console.error('[DEMO DEPLOYMENTS] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch deployments' },
      { status: 500 }
    );
  }
}
