import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

// UUID regex + .png extension only (prevent path traversal)
const VALID_ID = /^[a-f0-9-]{36}\.png$/i;

export async function GET(request, { params }) {
  try {
    const resolved = await params;
    const id = resolved?.id;

    if (!id || typeof id !== 'string') {
      return new NextResponse('Missing screenshot id', { status: 400 });
    }

    if (!VALID_ID.test(id)) {
      return new NextResponse('Invalid screenshot id', { status: 400 });
    }

    const screenshotPath = path.join(process.cwd(), 'public', 'screenshots', id);

    if (!fs.existsSync(screenshotPath)) {
      return new NextResponse('Screenshot not found', { status: 404 });
    }

    const fileBuffer = fs.readFileSync(screenshotPath);

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
