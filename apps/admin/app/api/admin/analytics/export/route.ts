import { NextRequest, NextResponse } from "next/server";

/**
 * Admin analytics CSV export route.
 * Fetches summary data from the backend and returns a CSV with the current snapshot.
 * A full historical export requires a dedicated backend endpoint (not yet implemented).
 */
export async function POST(request: NextRequest) {
  const backendUrl = (
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
  ).replace(/\/+$/, "");
  const url = `${backendUrl}/api/v1/admin/analytics`;

  let gmvToday = 0;
  let activeOffers = 0;
  let openTickets = 0;
  let totalContractors = 0;

  try {
    const authHeader = request.headers.get("authorization");
    const headers: Record<string, string> = {};
    if (authHeader) headers["Authorization"] = authHeader;

    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      gmvToday = data.gmvToday ?? 0;
      activeOffers = data.activeOffers ?? 0;
      openTickets = data.openTickets ?? 0;
      totalContractors = data.totalContractors ?? 0;
    }
  } catch {
    // Use zeros if backend unavailable
  }

  const today = new Date().toISOString().slice(0, 10);
  const csv = [
    "date,active_offers,gmv_today,open_tickets,total_contractors",
    `${today},${activeOffers},${gmvToday},${openTickets},${totalContractors}`,
  ].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="groupio-analytics-${today}.csv"`,
    },
  });
}
