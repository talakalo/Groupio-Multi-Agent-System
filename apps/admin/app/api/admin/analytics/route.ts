import { NextRequest, NextResponse } from "next/server";

/**
 * Admin analytics API route.
 * Returns mock data until GET /api/v1/admin/analytics is implemented on the backend.
 * Response includes source: "mock" for clarity.
 */
export async function GET(request: NextRequest) {
  const mock = {
    source: "mock" as const,
    totalOffers: 1247,
    offersTrend: 12.5,
    totalRevenue: 892_500,
    revenueTrend: 8.2,
    activeContractors: 186,
    contractorsTrend: 5.1,
    conversionRate: 0.34,
    conversionTrend: 2.1,
    avgResponseTime: 4.2,
    responseTrend: -0.5,
    escalationRate: 0.02,
    escalationTrend: -0.1,
    categoryBreakdown: {
      ac_installation: 280,
      plumbing: 320,
      electrical: 195,
      renovations: 220,
      painting: 132,
    },
    regionalData: {
      tel_aviv: 420,
      center: 380,
      haifa: 180,
      jerusalem: 150,
      north: 117,
    },
    dailyOffers: Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10),
      count: 35 + Math.floor(Math.random() * 20),
    })),
    dailyRevenue: Array.from({ length: 30 }, (_, i) => ({
      date: new Date(Date.now() - (29 - i) * 86_400_000).toISOString().slice(0, 10),
      amount: 28_000 + Math.floor(Math.random() * 8_000),
    })),
    agentPerformance: [
      { agent: "router", accuracy: 0.98, responseTime: 0.5, throughput: 1200 },
      { agent: "matching", accuracy: 0.92, responseTime: 1.2, throughput: 800 },
      { agent: "pricing", accuracy: 0.95, responseTime: 0.8, throughput: 950 },
      { agent: "support", accuracy: 0.88, responseTime: 2.1, throughput: 600 },
      { agent: "analytics", accuracy: 0.90, responseTime: 1.5, throughput: 150 },
    ],
    insights: [
      "AC and plumbing categories show highest conversion this period.",
      "Center and Tel Aviv regions drive ~64% of revenue.",
      "Support agent latency increased slightly; consider tuning prompts.",
    ],
  };

  return NextResponse.json(mock);
}
