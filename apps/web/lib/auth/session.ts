import { cookies } from 'next/headers';

const AUTH_COOKIE = 'groupio-auth';
const TOKEN_REFRESH_THRESHOLD = 5 * 60 * 1000; // 5 minutes

export interface Session {
  user: {
    id: string;
    email: string;
    fullName: string;
    role: 'resident' | 'contractor' | 'admin' | 'super_admin';
    buildingId?: string;
    contractorId?: string;
  } | null;
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: number | null;
}

/**
 * Get the current session from cookies (server-side)
 */
export async function getSession(): Promise<Session> {
  const cookieStore = await cookies();
  const authCookie = cookieStore.get(AUTH_COOKIE);

  const emptySession: Session = {
    user: null,
    accessToken: null,
    refreshToken: null,
    expiresAt: null,
  };

  if (!authCookie) {
    return emptySession;
  }

  try {
    const authData = JSON.parse(authCookie.value);
    const state = authData?.state;

    if (!state?.accessToken) {
      return emptySession;
    }

    return {
      user: state.user,
      accessToken: state.accessToken,
      refreshToken: state.refreshToken,
      expiresAt: state.expiresAt || null,
    };
  } catch {
    return emptySession;
  }
}

/**
 * Check if the session is valid and not expired
 */
export function isSessionValid(session: Session): boolean {
  if (!session.accessToken || !session.user) {
    return false;
  }

  if (session.expiresAt) {
    const now = Date.now();
    if (now >= session.expiresAt) {
      return false;
    }
  }

  return true;
}

/**
 * Check if the session should be refreshed
 */
export function shouldRefreshSession(session: Session): boolean {
  if (!session.accessToken || !session.expiresAt) {
    return false;
  }

  const now = Date.now();
  const timeUntilExpiry = session.expiresAt - now;

  return timeUntilExpiry < TOKEN_REFRESH_THRESHOLD;
}

/**
 * Decode a JWT token (without verification)
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
 * Get token expiration time
 */
export function getTokenExpiration(token: string): number | null {
  const decoded = decodeToken(token);
  if (!decoded || typeof decoded.exp !== 'number') {
    return null;
  }

  return decoded.exp * 1000; // Convert to milliseconds
}

/**
 * Authorization header helper
 */
export function getAuthorizationHeader(session: Session): Record<string, string> {
  if (!session.accessToken) {
    return {};
  }

  return {
    Authorization: `Bearer ${session.accessToken}`,
  };
}

/**
 * Check if user has required role
 */
export function hasRole(
  session: Session,
  roles: Array<'resident' | 'contractor' | 'admin' | 'super_admin'>
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
