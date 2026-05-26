/**
 * Admin uses HTTP-only cookies on the API origin. access_token expires quickly;
 * refresh_token lasts longer. On 401, try POST /auth/refresh once then retry.
 */

import { apiV1 } from "./backend-url";

let refreshInFlight: Promise<boolean> | null = null;

export async function refreshAdminAccessToken(): Promise<boolean> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const r = await fetch(apiV1("/auth/refresh"), {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });
        return r.ok;
      } catch {
        return false;
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

/** Retry the request once after a successful refresh (expired access_token). */
export async function fetchWithSessionRefresh(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  const next: RequestInit = {
    ...init,
    credentials: init?.credentials ?? "include",
  };
  let res = await fetch(url, next);
  if (res.status !== 401) return res;
  const ok = await refreshAdminAccessToken();
  if (!ok) return res;
  return fetch(url, next);
}
