import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";

// Paths served by the admin console that do NOT require authentication.
// Everything else under the app is gated behind a valid session cookie and
// an admin / super_admin / buildings_manager role hint.
const PUBLIC_PATHS = new Set<string>(["/login"]);

const ALLOWED_ADMIN_ROLES = new Set<string>([
  "admin",
  "super_admin",
  "buildings_manager",
]);

const intlMiddleware = createMiddleware({
  locales: ["he", "en"],
  defaultLocale: "he",
  localePrefix: "never",
  localeDetection: false,
});

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return pathname.startsWith("/login/");
}

function readRoleHint(request: NextRequest): string | null {
  // The Zustand `groupio-auth` cookie is client-writable — use it only for
  // UX routing hints. Real authorisation lives in the backend, which checks
  // the JWT access token on every request.
  const cookie = request.cookies.get("groupio-auth");
  if (!cookie) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(cookie.value));
    return parsed?.state?.user?.role ?? null;
  } catch {
    return null;
  }
}

export default function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (!isPublicPath(pathname)) {
    const hasRefreshCookie = !!request.cookies.get("refresh_token");
    if (!hasRefreshCookie) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }

    const role = readRoleHint(request);
    if (role && !ALLOWED_ADMIN_ROLES.has(role)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirect", pathname);
      return NextResponse.redirect(url);
    }
  }

  const response = intlMiddleware(request);
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  return response;
}

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
