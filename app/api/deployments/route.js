import { NextResponse } from 'next/server';
import path from 'path';
import Module from 'module';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

export async function GET() {
  try {
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
    const deploymentManager = originalRequire(resolvedPath);
    const deployments = deploymentManager.getAllDeployments();
    return NextResponse.json({ deployments });
  } catch (error) {
    console.error('Error fetching deployments:', error);
    console.error('Error details:', error.stack);
    return NextResponse.json(
      { error: 'Failed to fetch deployments', details: error.message },
      { status: 500 }
    );
  }
}
