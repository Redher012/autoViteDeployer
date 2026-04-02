import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import path from 'path';
import Module from 'module';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

// Note: Body size limits are configured in next.config.mjs
// For App Router, use runtime: 'nodejs' and configure in next.config.mjs

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes for large uploads

export async function POST(request) {
  try {
    // #region agent log
    fetch('http://127.0.0.1:7321/ingest/1f8d5258-140b-4575-a452-3cf09e8fea30',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b5753b'},body:JSON.stringify({sessionId:'b5753b',runId:'pre',hypothesisId:'H4',location:'app/api/upload/route.js:17',message:'api/upload POST entered',data:{contentType:request.headers.get('content-type'),contentLength:request.headers.get('content-length')},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

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

    // #region agent log
    fetch('http://127.0.0.1:7321/ingest/1f8d5258-140b-4575-a452-3cf09e8fea30',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b5753b'},body:JSON.stringify({sessionId:'b5753b',runId:'pre',hypothesisId:'H4',location:'app/api/upload/route.js:43',message:'api/upload file saved',data:{siteName:String(siteName||''),uploadFileName:fileName,uploadBytes:buffer.length},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

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

    // #region agent log
    fetch('http://127.0.0.1:7321/ingest/1f8d5258-140b-4575-a452-3cf09e8fea30',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b5753b'},body:JSON.stringify({sessionId:'b5753b',runId:'pre',hypothesisId:'H4',location:'app/api/upload/route.js:58',message:'api/upload deployProject resolved',data:{deploymentId:deployment?.id,subdomain:deployment?.subdomain,port:deployment?.port,status:deployment?.status},timestamp:Date.now()})}).catch(()=>{});
    // #endregion

    return NextResponse.json({
      success: true,
      deployment,
    });
  } catch (error) {
    console.error('Upload error:', error);
    // #region agent log
    fetch('http://127.0.0.1:7321/ingest/1f8d5258-140b-4575-a452-3cf09e8fea30',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'b5753b'},body:JSON.stringify({sessionId:'b5753b',runId:'pre',hypothesisId:'H4',location:'app/api/upload/route.js:66',message:'api/upload error',data:{errorMessage:error?.message,errorName:error?.name},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return NextResponse.json(
      { error: error.message || 'Failed to upload and deploy' },
      { status: 500 }
    );
  }
}
