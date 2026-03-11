import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Routes that require authentication
const protectedRoutes = [
  '/dashboard',
  '/offers',
  '/contractors',
  '/building',
  '/profile',
  '/chat',
  '/architecture',
  '/payments',
  '/contractor',
  '/admin',
  '/buildings-manager',
];

// Routes only for unauthenticated users
const authRoutes = ['/login', '/signup'];

// Routes that require specific roles (authentication already enforced above)
const contractorRoutes = ['/contractor'];
const adminRoutes = ['/admin'];
const buildingsManagerRoutes = ['/buildings-manager'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get locale from cookie or header
  const locale = request.cookies.get('NEXT_LOCALE')?.value ||
    request.headers.get('accept-language')?.split(',')[0].split('-')[0] ||
    'he';

  // Determine auth status from cookies.
  // The HTTP-only `refresh_token` cookie (set by the backend) is the
  // authoritative source of truth for "is the user logged in?".
  //
  // SECURITY NOTE: The `groupio-auth` cookie is a non-HttpOnly Zustand
  // persist cookie that can be written by client-side JavaScript — it MUST
  // NOT be trusted for access control decisions.  It is used here ONLY for
  // UX routing (redirect to the right dashboard, etc.).  Every API request
  // is independently authenticated server-side via the JWT access token.
  const hasRefreshCookie = !!request.cookies.get('refresh_token');
  let isAuthenticated = hasRefreshCookie;
  let userRole: string | null = null;

  // Read UX-only role hint from the client-writable Zustand cookie.
  // This is used purely for redirect decisions — never for access control.
  const authCookie = request.cookies.get('groupio-auth');
  if (authCookie) {
    try {
      const authData = JSON.parse(decodeURIComponent(authCookie.value));
      // Role is used for UX routing only — APIs enforce roles server-side.
      userRole = authData?.state?.user?.role ?? null;
      // If the Zustand cookie exists but there is no refresh cookie,
      // the session has expired — treat as unauthenticated.
      if (!hasRefreshCookie) {
        isAuthenticated = false;
        userRole = null;
      }
    } catch {
      // Invalid cookie format — ignore safely
    }
  }

  // Handle protected routes
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname.startsWith(route)
  );
  const isAuthRoute = authRoutes.some((route) => pathname.startsWith(route));
  const isContractorRoute = contractorRoutes.some((route) =>
    pathname.startsWith(route)
  );
  const isAdminRoute = adminRoutes.some((route) => pathname.startsWith(route));
  const isBuildingsManagerRoute = buildingsManagerRoutes.some((route) =>
    pathname.startsWith(route)
  );

  // Redirect unauthenticated users from protected routes
  if (isProtectedRoute && !isAuthenticated) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirect', pathname);
    return NextResponse.redirect(url);
  }

  // Redirect authenticated users from auth routes (role-based default)
  if (isAuthRoute && isAuthenticated) {
    const redirect = request.nextUrl.searchParams.get('redirect');
    const url = request.nextUrl.clone();
    if (redirect) {
      url.pathname = redirect;
    } else if (['admin', 'super_admin', 'buildings_manager'].includes(userRole || '')) {
      const adminUrl = process.env.NEXT_PUBLIC_ADMIN_URL || 'http://localhost:3001';
      return NextResponse.redirect(`${adminUrl}/dashboard`);
    } else if (userRole === 'contractor') {
      url.pathname = '/contractor/dashboard';
    } else {
      url.pathname = '/dashboard';
    }
    url.searchParams.delete('redirect');
    return NextResponse.redirect(url);
  }

  // Check role-gated routes (only reached when authenticated)
  if (isContractorRoute && userRole !== 'contractor') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  if (isAdminRoute && !['admin', 'super_admin'].includes(userRole || '')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  if (
    isBuildingsManagerRoute &&
    !['buildings_manager', 'admin', 'super_admin'].includes(userRole || '')
  ) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Add locale header for i18n
  const response = NextResponse.next();
  response.headers.set('x-locale', locale);

  // Add security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     * - api routes
     */
    '/((?!_next/static|_next/image|favicon.ico|public|api).*)',
  ],
};
