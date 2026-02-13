import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { execSync } from 'child_process';
import path from 'path';
import Module from 'module';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Max upload size: 50MB
export const maxDuration = 60; // 1 minute for large uploads

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    const siteName = formData.get('siteName') || 'Demo Project';

    if (!file) {
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }

    // Check file size (50MB limit)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `File size exceeds ${maxSize / 1024 / 1024}MB limit` },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // Save file to uploads directory temporarily
    const uploadsDir = join(process.cwd(), 'uploads');
    await mkdir(uploadsDir, { recursive: true });
    
    const fileName = `demo-${Date.now()}-${file.name}`;
    const filePath = join(uploadsDir, fileName);

    await writeFile(filePath, buffer);

    // Check zip bomb: use unzip -l to check uncompressed size
    try {
      const unzipOutput = execSync(`unzip -l "${filePath}" | tail -1`, {
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer for output
        timeout: 10000 // 10 second timeout
      });
      
      // Parse the last line which shows total uncompressed size
      // Format: "  XXXX files, XXXXXX bytes uncompressed"
      const match = unzipOutput.match(/(\d+)\s+bytes/);
      if (match) {
        const uncompressedSize = parseInt(match[1], 10);
        const maxExtractedSize = 50 * 1024 * 1024; // 50MB
        
        if (uncompressedSize > maxExtractedSize) {
          // Clean up uploaded file
          const fs = require('fs');
          fs.unlinkSync(filePath);
          
          return NextResponse.json(
            { error: `Zip file would extract to ${(uncompressedSize / 1024 / 1024).toFixed(2)}MB, exceeding ${maxExtractedSize / 1024 / 1024}MB limit` },
            { status: 400 }
          );
        }
        
        console.log(`[DEMO UPLOAD] Zip file uncompressed size: ${(uncompressedSize / 1024 / 1024).toFixed(2)}MB`);
      }
    } catch (error) {
      console.error('[DEMO UPLOAD] Error checking zip size:', error.message);
      // If unzip command fails, we'll still proceed but extraction will check size
    }

    // Use Node's Module API directly to bypass webpack's require system
    const modulePath = path.resolve(process.cwd(), 'lib', 'deployment-manager.js');
    const resolvedPath = Module._resolveFilename(modulePath, {
      id: __filename,
      filename: __filename,
      paths: Module._nodeModulePaths(process.cwd())
    });
    const originalRequire = Module.createRequire(__filename);
    const deploymentManager = originalRequire(resolvedPath);
    
    // Deploy the project as a demo (will expire in 30 minutes)
    const deployment = await deploymentManager.deployProject(filePath, siteName, { isDemo: true });

    return NextResponse.json({
      success: true,
      deployment,
      message: 'Demo project will be automatically deleted after 30 minutes'
    });
  } catch (error) {
    console.error('[DEMO UPLOAD] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to upload and deploy demo project' },
      { status: 500 }
    );
  }
}
