/**
 * Set the groupio-auth cookie so Next.js Edge middleware can identify authenticated
 * requests and perform role-based routing decisions.
 *
 * SECURITY NOTE: This cookie is intentionally NOT HttpOnly because it is written from
 * client-side JavaScript after login. It therefore MUST NOT contain the raw JWT access
 * token — only opaque, low-sensitivity routing metadata (role, isAuthenticated flag).
 *
 * The actual JWT lives exclusively in the Zustand in-memory store and is never persisted
 * to cookies or localStorage.
 */
const AUTH_COOKIE_NAME = "groupio-auth";
const AUTH_COOKIE_MAX_AGE_DAYS = 7;

export function setAuthCookie(
  _accessToken: string, // Accepted for call-site compatibility but intentionally NOT stored
  user: { role: string } | null,
): void {
  // Store ONLY routing metadata — never the raw JWT.
  // Storing JWTs in non-HttpOnly cookies is an XSS vulnerability:
  // any injected script can read document.cookie and steal the token.
  const value = encodeURIComponent(
    JSON.stringify({
      state: {
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

/**
 * Clear the groupio-auth cookie on logout.
 */
export function clearAuthCookie(): void {
  document.cookie = `${AUTH_COOKIE_NAME}=; path=/; max-age=0; samesite=lax`;
}
