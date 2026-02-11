import { NextResponse } from "next/server";

/**
 * Admin analytics export API route.
 * Returns mock CSV until POST /api/v1/admin/analytics/export is implemented on the backend.
 */
export async function POST() {
  const csv = [
    "date,offers,revenue,contractors",
    ...Array.from({ length: 30 }, (_, i) => {
      const date = new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10);
      const offers = 35 + Math.floor(Math.random() * 20);
      const revenue = 28_000 + Math.floor(Math.random() * 8_000);
      const contractors = 180 + Math.floor(Math.random() * 10);
      return `${date},${offers},${revenue},${contractors}`;
    }),
  ].join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="groupio-analytics-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
