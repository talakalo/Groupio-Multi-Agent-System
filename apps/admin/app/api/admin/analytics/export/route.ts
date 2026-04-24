import { NextRequest, NextResponse } from "next/server";

/**
 * Admin analytics CSV export.
 *
 * Snapshots the current state from /api/v1/admin/analytics and returns a CSV.
 * A historical export requires a dedicated backend endpoint that still needs
 * to be built — this route documents the gap by refusing to fabricate a row
 * of zeros when the backend is unreachable.
 */
export async function POST(request: NextRequest) {
  const backendUrl = (
    process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"
  ).replace(/\/+$/, "");
  const url = `${backendUrl}/api/v1/admin/analytics`;

  const authHeader = request.headers.get("authorization");
  const headers: Record<string, string> = {};
  if (authHeader) headers["Authorization"] = authHeader;

  let data: {
    gmvToday?: number;
    activeOffers?: number;
    openTickets?: number;
    totalContractors?: number;
  };

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Backend analytics returned ${res.status}` },
        { status: 502 },
      );
    }
    data = await res.json();
  } catch (err) {
    const message =
      err instanceof DOMException && err.name === "TimeoutError"
        ? "Backend analytics timed out"
        : "Backend analytics unreachable";
    return NextResponse.json({ error: message }, { status: 504 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const csv = [
    "date,active_offers,gmv_today,open_tickets,total_contractors",
    `${today},${data.activeOffers ?? 0},${data.gmvToday ?? 0},${data.openTickets ?? 0},${data.totalContractors ?? 0}`,
  ].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="groupio-analytics-${today}.csv"`,
    },
  });
}
