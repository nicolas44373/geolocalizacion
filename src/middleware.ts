import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Redirigir a /panel/login si intenta entrar a /panel sin la cookie admin_session
  if (pathname.startsWith('/panel') && pathname !== '/panel/login') {
    const adminSession = request.cookies.get('admin_session');
    
    if (!adminSession || adminSession.value !== 'true') {
      const loginUrl = new URL('/panel/login', request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  // Coincidir con todas las rutas que empiecen con /panel
  matcher: ['/panel/:path*'],
};
