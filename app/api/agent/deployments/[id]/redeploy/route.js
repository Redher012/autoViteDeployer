import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import path from 'path';
import Module from 'module';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

export const runtime = 'nodejs';
export const maxDuration = 300;

function getDeploymentManager() {
  const modulePath = path.resolve(process.cwd(), 'lib', 'deployment-manager.js');
  const resolvedPath = Module._resolveFilename(modulePath, {
    id: __filename,
    filename: __filename,
    paths: Module._nodeModulePaths(process.cwd())
  });
  const originalRequire = Module.createRequire(__filename);
  return originalRequire(resolvedPath);
}

function getAgentAuth() {
  const modulePath = path.resolve(process.cwd(), 'lib', 'agent-auth.js');
  const resolvedPath = Module._resolveFilename(modulePath, {
    id: __filename,
    filename: __filename,
    paths: Module._nodeModulePaths(process.cwd())
  });
  const originalRequire = Module.createRequire(__filename);
  return originalRequire(resolvedPath);
}

export async function POST(request, { params }) {
  try {
    const { verifyAgentBearer } = getAgentAuth();
    const auth = verifyAgentBearer(request.headers.get('authorization'));
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }

    const deploymentManager = getDeploymentManager();
    const existing = deploymentManager.getDeployment(id);
    if (!existing) {
      return NextResponse.json(
        { error: 'Deployment not found' },
        { status: 404 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadsDir = join(process.cwd(), 'uploads');
    await mkdir(uploadsDir, { recursive: true });

    const fileName = `${Date.now()}-${file.name}`;
    const filePath = join(uploadsDir, fileName);

    await writeFile(filePath, buffer);

    const deployment = await deploymentManager.redeployProject(id, filePath);

    return NextResponse.json({
      success: true,
      deployment,
    });
  } catch (error) {
    console.error('Agent redeploy error:', error);
    if (error.message === 'Deployment not found') {
      return NextResponse.json(
        { error: 'Deployment not found' },
        { status: 404 }
      );
    }
    return NextResponse.json(
      { error: error.message || 'Failed to redeploy' },
      { status: 500 }
    );
  }
}
