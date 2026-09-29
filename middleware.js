import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

function isPublicRoute(pathname, method) {
  if (pathname === '/login' || pathname.startsWith('/api/auth/')) {
    return true;
  }
  // Public demo page and its APIs (no login required)
  if (pathname === '/demo') {
    return true;
  }
  if (pathname.startsWith('/api/demo/')) {
    return true;
  }
  if (pathname.startsWith('/api/screenshots/')) {
    return true;
  }
  // Demo UI: remove/download demo projects only (enforced in route handlers)
  if (method === 'DELETE' && /^\/api\/deployments\/[^/]+$/.test(pathname)) {
    return true;
  }
  if (method === 'GET' && /^\/api\/deployments\/[^/]+\/download$/.test(pathname)) {
    return true;
  }
  return false;
}

/** Edge-safe constant-time string compare (middleware cannot use Node crypto). */
function timingSafeEqualString(a, b) {
  const encoder = new TextEncoder();
  const bufA = encoder.encode(a);
  const bufB = encoder.encode(b);
  if (bufA.byteLength !== bufB.byteLength) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < bufA.byteLength; i++) {
    diff |= bufA[i] ^ bufB[i];
  }
  return diff === 0;
}

function verifyAgentBearerInMiddleware(authHeader) {
  const apiKey = process.env.AGENT_API_KEY;
  if (!apiKey || apiKey.length === 0) {
    return {
      ok: false,
      status: 503,
      error: 'AGENT_API_KEY is not configured on the server',
    };
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const token = authHeader.slice('Bearer '.length);
  if (!timingSafeEqualString(token, apiKey)) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  return { ok: true };
}

export async function middleware(request) {
  const { pathname } = request.nextUrl;

  // Agent API: bearer token only (cookie alone must not authorize these routes)
  if (pathname.startsWith('/api/agent/')) {
    const authHeader = request.headers.get('authorization');
    const result = verifyAgentBearerInMiddleware(authHeader);
    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status }
      );
    }
    return NextResponse.next();
  }

  if (isPublicRoute(pathname, request.method)) {
    return NextResponse.next();
  }

  // Check authentication for all other routes
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token');

  // If no token, redirect to login (except for API routes which return 401)
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
