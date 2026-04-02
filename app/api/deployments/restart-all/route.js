import { NextResponse } from 'next/server';
import path from 'path';
import Module from 'module';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST() {
  try {
    const modulePath = path.resolve(process.cwd(), 'lib', 'deployment-manager.js');
    const resolvedPath = Module._resolveFilename(modulePath, {
      id: __filename,
      filename: __filename,
      paths: Module._nodeModulePaths(process.cwd()),
    });
    const originalRequire = Module.createRequire(__filename);
    const deploymentManager = originalRequire(resolvedPath);

    const results = await deploymentManager.restartAllDeployments();

    return NextResponse.json({ success: true, results });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || 'Failed to restart deployments' },
      { status: 500 }
    );
  }
}

