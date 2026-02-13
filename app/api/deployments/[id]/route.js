import { NextResponse } from 'next/server';
import path from 'path';
import Module from 'module';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

function getDeploymentManager() {
  // Use Node's Module API directly to bypass webpack's require system
  const modulePath = path.resolve(process.cwd(), 'lib', 'deployment-manager.js');
  // Use Module._resolveFilename to get the actual resolved path
  const resolvedPath = Module._resolveFilename(modulePath, {
    id: __filename,
    filename: __filename,
    paths: Module._nodeModulePaths(process.cwd())
  });
  // Create a new require function that bypasses webpack
  const originalRequire = Module.createRequire(__filename);
  return originalRequire(resolvedPath);
}

export async function GET(request, { params }) {
  try {
    // Next.js 15+ requires params to be awaited
    const { id } = await params;
    const deploymentManager = getDeploymentManager();
    const deployment = deploymentManager.getDeployment(id);
    if (!deployment) {
      return NextResponse.json(
        { error: 'Deployment not found' },
        { status: 404 }
      );
    }
    return NextResponse.json({ deployment });
  } catch (error) {
    console.error('Error fetching deployment:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deployment' },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  try {
    // Next.js 15+ requires params to be awaited
    const { id } = await params;
    const deploymentManager = getDeploymentManager();
    
    // Check if this is a demo request trying to delete a non-demo project
    const referer = request.headers.get('referer') || '';
    const isDemoRequest = referer.includes('/demo');
    
    if (isDemoRequest) {
      // Demo users can only delete their own demo projects
      const isDemo = deploymentManager.isDemoDeployment(id);
      if (!isDemo) {
        return NextResponse.json(
          { error: 'Unauthorized: Demo users can only remove their own projects' },
          { status: 403 }
        );
      }
    }
    
    await deploymentManager.removeDeployment(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing deployment:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to remove deployment' },
      { status: 500 }
    );
  }
}
