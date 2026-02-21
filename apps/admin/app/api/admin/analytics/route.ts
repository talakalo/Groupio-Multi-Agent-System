import { NextRequest, NextResponse } from "next/server";

/**
 * Admin analytics API route.
 * Proxies to the Python backend. Returns empty defaults if the backend is unavailable.
 */
export async function GET(request: NextRequest) {
  const backendUrl = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/+$/, "");
  const url = `${backendUrl}/api/v1/admin/analytics`;

  try {
    const authHeader = request.headers.get("authorization");
    const headers: Record<string, string> = {};
    if (authHeader) headers["Authorization"] = authHeader;

    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch {
    // Backend unavailable – return empty defaults
  }

  return NextResponse.json({
    gmvToday: 0,
    gmvChange: 0,
    activeOffers: 0,
    activeOffersChange: 0,
    openTickets: 0,
    openTicketsChange: 0,
    resolvedToday: 0,
    totalContractors: 0,
  });
}
