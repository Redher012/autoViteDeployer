import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const DEPLOYMENT_DOMAIN = process.env.DEPLOYMENT_DOMAIN || 'server.appstetic.com';

export async function middleware(request) {
  const { pathname } = request.nextUrl;
  const host = request.headers.get('host') || '';

  // Deployment subdomains (e.g. holymed.server.appstetic.com) must be handled by the
  // reverse proxy (port 8080), not this app. If we see such a host, Nginx is sending
  // subdomain traffic to the deployer (3000) by mistake — show a clear message instead
  // of redirecting to /login (which would then hit the proxy and show the deployed app’s 404).
  const domainEscaped = DEPLOYMENT_DOMAIN.replace(/\./g, '\\.');
  const subdomainMatch = host.match(new RegExp(`^([a-z0-9-]+)\\.${domainEscaped}$`, 'i'));
  if (subdomainMatch) {
    const subdomain = subdomainMatch[1];
    if (subdomain && subdomain !== 'www') {
      return new NextResponse(
        `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Misconfiguration</title></head><body style="font-family:sans-serif;max-width:600px;margin:2rem auto;padding:1rem;"><h1>Subdomain routing misconfigured</h1><p>Requests to <strong>${host}</strong> are reaching the deployer app instead of the reverse proxy.</p><p>Configure Nginx so <code>*.${DEPLOYMENT_DOMAIN}</code> is proxied to <strong>localhost:8080</strong> (the reverse proxy), not port 3000.</p><p>Example server block: <code>server_name *.${DEPLOYMENT_DOMAIN}; location / { proxy_pass http://127.0.0.1:8080; ... }</code></p></body></html>`,
        { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
      );
    }
  }

  // Allow login page and auth API routes
  if (pathname === '/login' || pathname.startsWith('/api/auth/')) {
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
