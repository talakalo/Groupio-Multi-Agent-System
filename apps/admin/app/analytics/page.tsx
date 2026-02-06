'use client';

import { useState, useEffect } from 'react';
import { MetricCard } from '@/components/features/metrics/MetricCard';
import { AgentMetricsChart } from '@/components/features/metrics/AgentMetricsChart';

interface AnalyticsData {
  totalOffers: number;
  offersTrend: number;
  totalRevenue: number;
  revenueTrend: number;
  activeContractors: number;
  contractorsTrend: number;
  conversionRate: number;
  conversionTrend: number;
  avgResponseTime: number;
  responseTrend: number;
  escalationRate: number;
  escalationTrend: number;
  categoryBreakdown: Record<string, number>;
  regionalData: Record<string, number>;
  dailyOffers: { date: string; count: number }[];
  dailyRevenue: { date: string; amount: number }[];
  agentPerformance: {
    agent: string;
    accuracy: number;
    responseTime: number;
    throughput: number;
  }[];
  insights: string[];
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | '1y'>('30d');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    async function fetchAnalytics() {
      setIsLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('range', dateRange);
        if (startDate) params.set('start', startDate);
        if (endDate) params.set('end', endDate);

        const res = await fetch(`/api/admin/analytics?${params}`);
        if (res.ok) {
          setData(await res.json());
        }
      } catch (error) {
        console.error('Failed to fetch analytics:', error);
      } finally {
        setIsLoading(false);
      }
    }

    fetchAnalytics();
  }, [dateRange, startDate, endDate]);

  async function handleExport() {
    try {
      const res = await fetch('/api/admin/analytics/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateRange, startDate, endDate }),
      });

      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `groupio-analytics-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Failed to export:', error);
    }
  }

  const categoryColors: Record<string, string> = {
    ac_installation: '#0ea5e9',
    kitchen: '#8b5cf6',
    electrical: '#f59e0b',
    plumbing: '#10b981',
    painting: '#ec4899',
    flooring: '#6366f1',
    windows: '#14b8a6',
    security: '#f97316',
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500" />
      </div>
    );
  }

  return (
    <div className="p-8">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Analytics Dashboard</h1>
          <p className="text-gray-600 mt-1">
            Comprehensive insights into platform performance
          </p>
        </div>
        <button
          onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg font-medium transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Export CSV
        </button>
      </header>

      {/* Date Range Selector */}
      <div className="bg-white rounded-xl shadow-sm border p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex rounded-lg border overflow-hidden">
            {(['7d', '30d', '90d', '1y'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-4 py-2 font-medium transition-colors ${
                  dateRange === range
                    ? 'bg-sky-500 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {range === '7d' && '7 Days'}
                {range === '30d' && '30 Days'}
                {range === '90d' && '90 Days'}
                {range === '1y' && '1 Year'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-gray-500">or</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500"
            />
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
        <MetricCard
          label="Total Offers"
          value={data?.totalOffers ?? 0}
          trend={data?.offersTrend}
          icon="document"
        />
        <MetricCard
          label="Total Revenue"
          value={`₪${(data?.totalRevenue ?? 0).toLocaleString()}`}
          trend={data?.revenueTrend}
          icon="currency"
        />
        <MetricCard
          label="Active Contractors"
          value={data?.activeContractors ?? 0}
          trend={data?.contractorsTrend}
          icon="users"
        />
        <MetricCard
          label="Conversion Rate"
          value={`${(data?.conversionRate ?? 0).toFixed(1)}%`}
          trend={data?.conversionTrend}
          icon="chart"
        />
        <MetricCard
          label="Avg Response Time"
          value={`${(data?.avgResponseTime ?? 0).toFixed(0)}ms`}
          trend={data?.responseTrend}
          trendInverse
          icon="clock"
        />
        <MetricCard
          label="Escalation Rate"
          value={`${(data?.escalationRate ?? 0).toFixed(1)}%`}
          trend={data?.escalationTrend}
          trendInverse
          icon="alert"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Offers Over Time */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">Offers Over Time</h2>
          <div className="h-64">
            <AgentMetricsChart
              data={data?.dailyOffers ?? []}
              dataKey="count"
              xAxisKey="date"
              color="#0ea5e9"
            />
          </div>
        </div>

        {/* Revenue Over Time */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">Revenue Over Time</h2>
          <div className="h-64">
            <AgentMetricsChart
              data={data?.dailyRevenue ?? []}
              dataKey="amount"
              xAxisKey="date"
              color="#10b981"
              formatValue={(v) => `₪${v.toLocaleString()}`}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Category Breakdown */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">Category Breakdown</h2>
          <div className="space-y-3">
            {Object.entries(data?.categoryBreakdown ?? {}).map(([category, count]) => {
              const total = Object.values(data?.categoryBreakdown ?? {}).reduce(
                (a, b) => a + b,
                0
              );
              const percentage = total ? (count / total) * 100 : 0;
              return (
                <div key={category}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 capitalize">
                      {category.replace('_', ' ')}
                    </span>
                    <span className="font-medium">{count}</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="h-2 rounded-full transition-all duration-500"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: categoryColors[category] ?? '#6b7280',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Regional Distribution */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">Regional Distribution</h2>
          <div className="space-y-3">
            {Object.entries(data?.regionalData ?? {}).map(([region, count]) => {
              const total = Object.values(data?.regionalData ?? {}).reduce(
                (a, b) => a + b,
                0
              );
              const percentage = total ? (count / total) * 100 : 0;
              return (
                <div key={region}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600 capitalize">
                      {region.replace('_', ' ')}
                    </span>
                    <span className="font-medium">{percentage.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-violet-500 transition-all duration-500"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* AI Insights */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-lg font-semibold mb-4">AI Insights</h2>
          <div className="space-y-3">
            {(data?.insights ?? []).map((insight, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-3 bg-gradient-to-r from-sky-50 to-violet-50 rounded-lg"
              >
                <span className="text-sky-500 mt-0.5">💡</span>
                <p className="text-sm text-gray-700">{insight}</p>
              </div>
            ))}
            {(!data?.insights || data.insights.length === 0) && (
              <p className="text-gray-500 text-sm">
                No insights available for this period.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Agent Performance Comparison */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-lg font-semibold mb-4">Agent Performance Comparison</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-4 font-medium text-gray-600">Agent</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600">Accuracy</th>
                <th className="text-right py-3 px-4 font-medium text-gray-600">
                  Avg Response Time
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-600">
                  Throughput (req/min)
                </th>
                <th className="text-right py-3 px-4 font-medium text-gray-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {(data?.agentPerformance ?? []).map((agent) => (
                <tr key={agent.agent} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium capitalize">{agent.agent}</td>
                  <td className="text-right py-3 px-4">
                    <span
                      className={`font-medium ${
                        agent.accuracy >= 95
                          ? 'text-green-600'
                          : agent.accuracy >= 90
                          ? 'text-yellow-600'
                          : 'text-red-600'
                      }`}
                    >
                      {agent.accuracy.toFixed(1)}%
                    </span>
                  </td>
                  <td className="text-right py-3 px-4">
                    <span
                      className={`font-medium ${
                        agent.responseTime < 200
                          ? 'text-green-600'
                          : agent.responseTime < 500
                          ? 'text-yellow-600'
                          : 'text-red-600'
                      }`}
                    >
                      {agent.responseTime}ms
                    </span>
                  </td>
                  <td className="text-right py-3 px-4">{agent.throughput}</td>
                  <td className="text-right py-3 px-4">
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                      Active
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
