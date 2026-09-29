import { NextResponse } from 'next/server';
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

function deploymentUrl(deployment) {
  if (process.env.DEPLOYMENT_DOMAIN && deployment.subdomain) {
    return `https://${deployment.subdomain}.${process.env.DEPLOYMENT_DOMAIN}`;
  }
  if (deployment.port) {
    return `http://localhost:${deployment.port}`;
  }
  return null;
}

export async function GET(request, { params }) {
  try {
    const { verifyAgentBearer } = getAgentAuth();
    const auth = verifyAgentBearer(request.headers.get('authorization'));
    if (!auth.ok) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id } = await params;
    const deploymentManager = getDeploymentManager();
    const deployment = deploymentManager.getDeployment(id);

    if (!deployment) {
      return NextResponse.json(
        { error: 'Deployment not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      deployment: {
        id: deployment.id,
        site_name: deployment.site_name,
        subdomain: deployment.subdomain,
        status: deployment.status,
        port: deployment.port,
        url: deploymentUrl(deployment),
        updated_at: deployment.updated_at,
        error_log: deployment.error_log,
      },
    });
  } catch (error) {
    console.error('Agent get deployment error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch deployment' },
      { status: 500 }
    );
  }
}
