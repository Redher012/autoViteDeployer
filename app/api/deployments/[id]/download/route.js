import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import Module from 'module';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

// Ensure this route is not cached
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request, { params }) {
  console.log('[DOWNLOAD] Endpoint called', { url: request.url });
  
  try {
    // Next.js 16+ requires params to be awaited
    const { id } = await params;
    
    console.log('[DOWNLOAD] Extracted ID', { id });

    // Use Node's Module API directly to bypass webpack's require system
    const modulePath = path.resolve(process.cwd(), 'lib', 'deployment-manager.js');
    const resolvedPath = Module._resolveFilename(modulePath, {
      id: __filename,
      filename: __filename,
      paths: Module._nodeModulePaths(process.cwd())
    });
    const originalRequire = Module.createRequire(__filename);
    const deploymentManager = originalRequire(resolvedPath);
    
    const deployment = deploymentManager.getDeployment(id);
    
    console.log('[DOWNLOAD] Retrieved deployment', { 
      found: !!deployment, 
      hasFilePath: !!deployment?.file_path,
      filePath: deployment?.file_path,
      deploymentKeys: deployment ? Object.keys(deployment) : null
    });
    
    if (!deployment) {
      console.log('[DOWNLOAD] Deployment not found', { id });
      return NextResponse.json(
        { error: 'Deployment not found' },
        { status: 404 }
      );
    }
    
    // Check if this is a demo request trying to download a non-demo project
    const referer = request.headers.get('referer') || '';
    const isDemoRequest = referer.includes('/demo');
    
    if (isDemoRequest) {
      // Demo users can only download their own demo projects
      const isDemo = deploymentManager.isDemoDeployment(id);
      if (!isDemo) {
        console.log('[DOWNLOAD] Unauthorized: Demo user trying to download non-demo project', { id });
        return NextResponse.json(
          { error: 'Unauthorized: Demo users can only download their own projects' },
          { status: 403 }
        );
      }
    }

    if (!deployment.file_path) {
      console.log('[DOWNLOAD] File path missing', { id, deploymentKeys: Object.keys(deployment) });
      return NextResponse.json(
        { error: 'File path not found for this deployment' },
        { status: 404 }
      );
    }

    // Check if file exists
    const fs = require('fs');
    const fileExists = fs.existsSync(deployment.file_path);
    
    console.log('[DOWNLOAD] File existence check', { 
      filePath: deployment.file_path, 
      exists: fileExists 
    });
    
    if (!fileExists) {
      console.log('[DOWNLOAD] File does not exist', { filePath: deployment.file_path });
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    // Read the file
    const fileBuffer = await readFile(deployment.file_path);
    const fileName = path.basename(deployment.file_path);
    
    console.log('[DOWNLOAD] File read successfully', { 
      fileName, 
      bufferLength: fileBuffer.length 
    });

    // Return the file as a download - use Response for binary data
    // Convert Buffer to ArrayBuffer for proper binary handling
    const arrayBuffer = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength
    );
    
    console.log('[DOWNLOAD] Returning file response', {
      fileName,
      size: fileBuffer.length,
      contentType: 'application/zip'
    });
    
    return new Response(arrayBuffer, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
        'Content-Length': fileBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error('[DOWNLOAD] Error occurred', { 
      error: error.message, 
      stack: error.stack 
    });
    return NextResponse.json(
      { error: error.message || 'Failed to download file' },
      { status: 500 }
    );
  }
}
