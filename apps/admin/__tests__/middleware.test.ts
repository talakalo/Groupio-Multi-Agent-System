import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Unit tests for apps/admin/middleware.ts.
 *
 * Before the release-audit fix the admin middleware only installed
 * next-intl, meaning the console was reachable without any session
 * cookie and resident/contractor roles could see its shell HTML before
 * the API declined their requests. These tests pin the new behaviour:
 *
 *   - unauthenticated requests to non-public paths redirect to /login
 *   - non-admin role hints are bounced to /login
 *   - /login itself is always reachable
 *   - admin / super_admin role hints plus refresh_token cookie pass through
 *   - buildings_manager is bounced to /login (building-scoped, not a platform admin)
 */

// next-intl pulls in Next internals that don't run under jsdom cleanly.
// The middleware uses it only to return a NextResponse.next() for
// non-redirected traffic, so stub it to the simplest passthrough.
vi.mock("next-intl/middleware", () => ({
  default: () => {
    return () => NextResponse.next();
  },
}));

import middleware from "../middleware";

function buildRequest(
  pathname: string,
  cookies: Record<string, string> = {},
): NextRequest {
  const url = `https://admin.groupio.test${pathname}`;
  const cookieHeader = Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
  return new NextRequest(url, {
    headers: cookieHeader ? { cookie: cookieHeader } : {},
  });
}

function encodeAuthCookie(role: string): string {
  return encodeURIComponent(
    JSON.stringify({ state: { user: { role } } }),
  );
}

describe("apps/admin middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects unauthenticated requests to /login with ?redirect", () => {
    const req = buildRequest("/dashboard");
    const res = middleware(req);
    expect(res.status).toBe(307);
    const location = res.headers.get("location");
    expect(location).toBeTruthy();
    expect(location).toContain("/login");
    expect(location).toContain("redirect=%2Fdashboard");
  });

  it("allows /login without a session cookie", () => {
    const req = buildRequest("/login");
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  it("allows /login/anything sub-path without a session cookie", () => {
    const req = buildRequest("/login/reset");
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  it("redirects a resident role to /login even with a refresh cookie", () => {
    const req = buildRequest("/dashboard", {
      refresh_token: "irrelevant-server-validates",
      "groupio-auth": encodeAuthCookie("resident"),
    });
    const res = middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("redirects a contractor role to /login", () => {
    const req = buildRequest("/contractors", {
      refresh_token: "sess",
      "groupio-auth": encodeAuthCookie("contractor"),
    });
    const res = middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("passes through an authenticated admin", () => {
    const req = buildRequest("/dashboard", {
      refresh_token: "sess",
      "groupio-auth": encodeAuthCookie("admin"),
    });
    const res = middleware(req);
    expect(res.status).toBe(200);
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("passes through a super_admin", () => {
    const req = buildRequest("/users", {
      refresh_token: "sess",
      "groupio-auth": encodeAuthCookie("super_admin"),
    });
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  it("redirects a buildings_manager to /login (P0 RBAC — not a platform admin)", () => {
    // buildings_manager is building-scoped; the admin shell is for platform admins only.
    // The web app (:3000) serves /buildings-manager/dashboard for this role.
    const req = buildRequest("/escalations", {
      refresh_token: "sess",
      "groupio-auth": encodeAuthCookie("buildings_manager"),
    });
    const res = middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });

  it("passes through when refresh cookie is present and role hint is absent", () => {
    // Page-level / API-level checks catch non-admins in this case — the
    // middleware's job is only to block obvious cross-role access.
    const req = buildRequest("/dashboard", {
      refresh_token: "sess",
    });
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  it("ignores a malformed groupio-auth cookie", () => {
    const req = buildRequest("/dashboard", {
      refresh_token: "sess",
      "groupio-auth": "not%20valid%20json",
    });
    const res = middleware(req);
    // Treated as "no role hint" -> allowed through; server still enforces.
    expect(res.status).toBe(200);
  });
});
