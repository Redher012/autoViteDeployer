import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request, context) {
  try {
    // Next.js 15+: params is a Promise
    const params = await context.params;
    const id = params?.id;
    
    console.log('[SCREENSHOT API] Requested id:', id);
    
    if (!id || typeof id !== 'string') {
      console.log('[SCREENSHOT API] Missing or invalid id');
      return new NextResponse('Missing screenshot id', { status: 400 });
    }

    // Only allow uuid.png format
    const uuidRegex = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}\.png$/i;
    if (!uuidRegex.test(id)) {
      console.log('[SCREENSHOT API] Invalid id format:', id);
      return new NextResponse('Invalid screenshot id format', { status: 400 });
    }

    const screenshotsDir = path.join(process.cwd(), 'public', 'screenshots');
    const screenshotPath = path.join(screenshotsDir, id);
    
    console.log('[SCREENSHOT API] Looking for file at:', screenshotPath);

    if (!fs.existsSync(screenshotPath)) {
      console.log('[SCREENSHOT API] File not found');
      return new NextResponse('Screenshot not found', { status: 404 });
    }

    const stats = fs.statSync(screenshotPath);
    console.log('[SCREENSHOT API] File size:', stats.size, 'bytes');

    const fileBuffer = fs.readFileSync(screenshotPath);

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(stats.size),
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (error) {
    console.error('[SCREENSHOT API] Error:', error);
    return new NextResponse('Error serving screenshot', { status: 500 });
  }
}
