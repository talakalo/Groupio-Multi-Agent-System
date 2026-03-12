import { NextRequest, NextResponse } from "next/server";

/**
 * Admin panel route protection middleware.
 *
 * All admin routes require an authenticated session. The presence of the
 * HTTP-only `refresh_token` cookie (set by the backend at login) is used
 * as the authentication signal — it cannot be forged by client-side scripts.
 *
 * Unauthenticated requests are redirected to /login, preserving the
 * originally-requested path in the `from` query parameter so the user
 * can be sent back after a successful login.
 */

/** Paths that must remain accessible without authentication. */
const PUBLIC_PATHS = ["/login"];

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Allow public paths through without auth check
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) {
    return addSecurityHeaders(NextResponse.next());
  }

  // Allow Next.js internal paths and static assets
  if (
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/api/")
  ) {
    return NextResponse.next();
  }

  // Check for the HTTP-only refresh token set by the backend at login.
  // This cookie cannot be read or written by client-side JavaScript, so
  // its presence is a reliable authentication signal.
  const refreshToken = request.cookies.get("refresh_token");
  if (!refreshToken?.value) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // NOTE: Admin role is enforced by the backend (get_admin_user) on API calls.
  // The login page also verifies role before granting access. A future hardening
  // could require the admin_role_verified cookie (set by login after role check)
  // in addition to refresh_token, once all users have re-logged.

  return addSecurityHeaders(NextResponse.next());
}

function addSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}

export const config = {
  // Match all routes except Next.js internals and static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
