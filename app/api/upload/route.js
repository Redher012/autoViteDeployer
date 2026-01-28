import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import path from 'path';
import Module from 'module';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

export async function POST(request) {
  try {
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

    // Save file to uploads directory
    const uploadsDir = join(process.cwd(), 'uploads');
    await mkdir(uploadsDir, { recursive: true });
    
    const fileName = `${Date.now()}-${file.name}`;
    const filePath = join(uploadsDir, fileName);

    await writeFile(filePath, buffer);

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
    
    // Deploy the project
    const deployment = await deploymentManager.deployProject(filePath, siteName);

    return NextResponse.json({
      success: true,
      deployment,
    });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload and deploy' },
      { status: 500 }
    );
  }
}
