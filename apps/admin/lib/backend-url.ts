/**
 * Resolve FastAPI origin + /api/v1 paths for browser fetches.
 * NEXT_PUBLIC_API_URL must be the API host (e.g. http://localhost:8000), not the admin app (3001).
 */

export function getBackendOrigin(): string {
  let raw = (process.env.NEXT_PUBLIC_API_URL ?? "").trim().replace(/\/+$/, "");
  if (!raw) raw = "http://localhost:8000";
  if (raw.endsWith("/api/v1")) raw = raw.replace(/\/api\/v1$/, "");
  return raw;
}

/** e.g. apiV1("/admin/users") -> http://localhost:8000/api/v1/admin/users */
export function apiV1(path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${getBackendOrigin()}/api/v1${p}`;
}
