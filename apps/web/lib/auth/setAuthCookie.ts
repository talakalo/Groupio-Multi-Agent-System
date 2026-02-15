/**
 * Set the groupio-auth cookie so Next.js middleware and layouts see the user as authenticated.
 * Must be called from client after login/signup (cookie is not HttpOnly so middleware can read it).
 */
const AUTH_COOKIE_NAME = "groupio-auth";
const AUTH_COOKIE_MAX_AGE_DAYS = 7;

export function setAuthCookie(accessToken: string, user: { role: string } | null): void {
  const value = encodeURIComponent(
    JSON.stringify({
      state: {
        accessToken,
        user: user ? { role: user.role } : null,
        isAuthenticated: true,
      },
    })
  );
  const maxAge = AUTH_COOKIE_MAX_AGE_DAYS * 24 * 60 * 60;
  const isSecure = typeof window !== "undefined" && window.location.protocol === "https:";
  const securePart = isSecure ? "; secure" : "";
  document.cookie = `${AUTH_COOKIE_NAME}=${value}; path=/; max-age=${maxAge}; samesite=lax${securePart}`;
}
