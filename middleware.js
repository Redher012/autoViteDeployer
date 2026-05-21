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

export async function middleware(request) {
  const { pathname } = request.nextUrl;

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
