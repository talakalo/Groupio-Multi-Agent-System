import { cookies } from 'next/headers';

const AUTH_PERSIST_COOKIE = 'groupio-auth';
const REFRESH_COOKIE = 'refresh_token';
const TOKEN_REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes

export interface Session {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: 'resident' | 'contractor' | 'admin' | 'super_admin' | 'buildings_manager';
    buildingId?: string;
    contractorId?: string;
  } | null;
  /** True when the HTTP-only refresh cookie is present. */
  hasRefreshToken: boolean;
  expiresAt: number | null;
}

/**
 * Get the current session from cookies (server-side).
 *
 * The access token is never stored in cookies – it lives in client
 * memory only.  The HTTP-only `refresh_token` cookie (set by the
 * backend) indicates the user is logged in, and the Zustand-persisted
 * `groupio-auth` cookie provides the cached user profile.
 */
export async function getSession(): Promise<Session> {
  const cookieStore = await cookies();
  const refreshCookie = cookieStore.get(REFRESH_COOKIE);
  const authCookie = cookieStore.get(AUTH_PERSIST_COOKIE);

  const emptySession: Session = {
    user: null,
    hasRefreshToken: false,
    expiresAt: null,
  };

  if (!refreshCookie) {
    return emptySession;
  }

  let user = null;
  if (authCookie) {
    try {
      const authData = JSON.parse(authCookie.value);
      user = authData?.state?.user ?? null;
    } catch {
      // Invalid cookie format – ignore
    }
  }

  return {
    user,
    hasRefreshToken: true,
    expiresAt: null,
  };
}

/**
 * Check if the session is valid (user present + refresh cookie exists).
 */
export function isSessionValid(session: Session): boolean {
  return session.hasRefreshToken && !!session.user;
}

/**
 * Check if the session should be refreshed.
 */
export function shouldRefreshSession(session: Session): boolean {
  if (!session.hasRefreshToken || !session.expiresAt) {
    return false;
  }

  const now = Date.now();
  const timeUntilExpiry = session.expiresAt - now;

  return timeUntilExpiry < TOKEN_REFRESH_THRESHOLD;
}

/**
 * Decode a JWT token payload (without signature verification).
 */
export function decodeToken(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = parts[1];
    const decoded = Buffer.from(payload, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Get token expiration time (ms since epoch).
 */
export function getTokenExpiration(token: string): number | null {
  const decoded = decodeToken(token);
  if (!decoded || typeof decoded.exp !== 'number') {
    return null;
  }

  return decoded.exp * 1000;
}

/**
 * Check if user has required role
 */
export function hasRole(
  session: Session,
  roles: Array<'resident' | 'contractor' | 'admin' | 'super_admin' | 'buildings_manager'>
): boolean {
  if (!session.user) {
    return false;
  }

  return roles.includes(session.user.role);
}

/**
 * Check if user is admin
 */
export function isAdmin(session: Session): boolean {
  return hasRole(session, ['admin', 'super_admin']);
}

/**
 * Check if user is contractor
 */
export function isContractor(session: Session): boolean {
  return hasRole(session, ['contractor']);
}
