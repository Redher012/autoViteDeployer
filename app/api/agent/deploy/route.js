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

export async function POST(request) {
  try {
    const { verifyAgentBearer } = getAgentAuth();
    const auth = verifyAgentBearer(request.headers.get('authorization'));
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const siteName = formData.get('siteName') || 'Untitled Site';

    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const uploadsDir = join(process.cwd(), 'uploads');
    await mkdir(uploadsDir, { recursive: true });

    const fileName = `${Date.now()}-${file.name}`;
    const filePath = join(uploadsDir, fileName);

    await writeFile(filePath, buffer);

    const deploymentManager = getDeploymentManager();
    const deployment = await deploymentManager.deployProject(filePath, siteName);

    return NextResponse.json({
      success: true,
      deployment,
    });
  } catch (error) {
    console.error('Agent deploy error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to deploy' },
      { status: 500 }
    );
  }
}
