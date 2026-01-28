import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request, { params }) {
  try {
    const { id } = params;
    const screenshotPath = path.join(process.cwd(), 'public', 'screenshots', id);
    
    // Check if file exists
    if (!fs.existsSync(screenshotPath)) {
      return new NextResponse('Screenshot not found', { status: 404 });
    }
    
    // Read the file
    const fileBuffer = fs.readFileSync(screenshotPath);
    
    // Return the image with proper headers
    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Error serving screenshot:', error);
    return new NextResponse('Error serving screenshot', { status: 500 });
  }
}
