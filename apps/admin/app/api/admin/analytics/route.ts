import { NextRequest, NextResponse } from "next/server";

/**
 * Admin analytics proxy.
 *
 * The admin console talks to the Python backend's /api/v1/admin/analytics.
 * This route exists only to forward the browser's Authorization header from
 * the same origin; there is no parallel implementation here.
 *
 * Backend failures propagate as 502/504 instead of being masked with zeros —
 * masking a failing metric endpoint with an all-zero body makes real outages
 * look like "all quiet" on the dashboard, which delays incident response.
 */
export async function GET(request: NextRequest) {
  const backendUrl = (
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
  ).replace(/\/+$/, "");
  const url = `${backendUrl}/api/v1/admin/analytics`;

  const authHeader = request.headers.get("authorization");
  const headers: Record<string, string> = {};
  if (authHeader) headers["Authorization"] = authHeader;

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { "Content-Type": res.headers.get("Content-Type") ?? "application/json" },
    });
  } catch (err) {
    const message =
      err instanceof DOMException && err.name === "TimeoutError"
        ? "Backend analytics timed out"
        : "Backend analytics unreachable";
    return NextResponse.json(
      { error: message },
      { status: 504 },
    );
  }
}
