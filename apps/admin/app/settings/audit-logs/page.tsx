'use client';

import { useQuery } from '@tanstack/react-query';
import { FileText, Download, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import { useState, useCallback } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface AuditLog {
  id: string;
  user_email: string;
  action: string;
  resource_type: string;
  resource_id: string;
  ip_address: string;
  timestamp: string;
  details?: Record<string, unknown>;
}

interface AuditLogsResponse {
  items: AuditLog[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

const ACTION_TYPES = [
  { value: '', label: 'All Actions' },
  { value: 'create', label: 'Create' },
  { value: 'update', label: 'Update' },
  { value: 'delete', label: 'Delete' },
  { value: 'login', label: 'Login' },
  { value: 'logout', label: 'Logout' },
  { value: 'export', label: 'Export' },
  { value: 'approve', label: 'Approve' },
  { value: 'reject', label: 'Reject' },
  { value: 'escalate', label: 'Escalate' },
];

const RESOURCE_TYPES = [
  { value: '', label: 'All Resources' },
  { value: 'user', label: 'User' },
  { value: 'offer', label: 'Offer' },
  { value: 'contractor', label: 'Contractor' },
  { value: 'building', label: 'Building' },
  { value: 'payment', label: 'Payment' },
  { value: 'escalation', label: 'Escalation' },
  { value: 'setting', label: 'Setting' },
];

async function fetchAuditLogs(params: {
  page: number;
  page_size: number;
  action?: string;
  resource_type?: string;
  date_from?: string;
  date_to?: string;
}): Promise<AuditLogsResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set('page', String(params.page));
  searchParams.set('page_size', String(params.page_size));
  if (params.action) searchParams.set('action', params.action);
  if (params.resource_type) searchParams.set('resource_type', params.resource_type);
  if (params.date_from) searchParams.set('date_from', params.date_from);
  if (params.date_to) searchParams.set('date_to', params.date_to);

  const res = await fetch(`${API_URL}/api/v1/admin/audit-logs?${searchParams.toString()}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch audit logs: ${res.status}`);
  }

  return res.json();
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function actionBadgeColor(action: string): string {
  switch (action.toLowerCase()) {
    case 'create':
      return 'bg-green-100 text-green-800';
    case 'update':
      return 'bg-blue-100 text-blue-800';
    case 'delete':
      return 'bg-red-100 text-red-800';
    case 'login':
      return 'bg-violet-100 text-violet-800';
    case 'logout':
      return 'bg-gray-100 text-gray-800';
    case 'approve':
      return 'bg-emerald-100 text-emerald-800';
    case 'reject':
      return 'bg-orange-100 text-orange-800';
    case 'escalate':
      return 'bg-amber-100 text-amber-800';
    default:
      return 'bg-sky-100 text-sky-800';
  }
}

export default function AuditLogsPage() {
  const [page, setPage] = useState(1);
  const [pageSize] = useState(25);
  const [actionFilter, setActionFilter] = useState('');
  const [resourceTypeFilter, setResourceTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const { data, isLoading, isError, error } = useQuery<AuditLogsResponse>({
    queryKey: ['audit-logs', page, pageSize, actionFilter, resourceTypeFilter, dateFrom, dateTo],
    queryFn: () =>
      fetchAuditLogs({
        page,
        page_size: pageSize,
        action: actionFilter || undefined,
        resource_type: resourceTypeFilter || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
      }),
  });

  const handleExportCSV = useCallback(() => {
    if (!data?.items?.length) return;

    const headers = ['User Email', 'Action', 'Resource Type', 'Resource ID', 'IP Address', 'Time'];
    const rows = data.items.map((log) => [
      log.user_email,
      log.action,
      log.resource_type,
      log.resource_id,
      log.ip_address,
      log.timestamp,
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [data]);

  const handleClearFilters = () => {
    setActionFilter('');
    setResourceTypeFilter('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const totalPages = data?.total_pages ?? 1;

  return (
    <div className="p-8">
      {/* Header */}
      <header className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-sky-100 rounded-lg">
            <FileText className="w-6 h-6 text-sky-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
            <p className="text-gray-500 text-sm mt-0.5">
              Track all system activities and user actions
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              showFilters
                ? 'bg-sky-500 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            <Filter className="w-4 h-4" />
            Filters
            {(actionFilter || resourceTypeFilter || dateFrom || dateTo) && (
              <span className="w-2 h-2 rounded-full bg-sky-300" />
            )}
          </button>

          <button
            onClick={handleExportCSV}
            disabled={!data?.items?.length}
            className="flex items-center gap-2 px-4 py-2 bg-gray-900 text-white rounded-lg font-medium text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </header>

      {/* Filters Panel */}
      {showFilters && (
        <div className="bg-white rounded-xl shadow-sm border p-5 mb-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[180px]">
              <label htmlFor="action-filter" className="block text-sm font-medium text-gray-700 mb-1.5">
                Action Type
              </label>
              <select
                id="action-filter"
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500 text-sm"
              >
                {ACTION_TYPES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 min-w-[180px]">
              <label htmlFor="resource-type-filter" className="block text-sm font-medium text-gray-700 mb-1.5">
                Resource Type
              </label>
              <select
                id="resource-type-filter"
                value={resourceTypeFilter}
                onChange={(e) => {
                  setResourceTypeFilter(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500 text-sm"
              >
                {RESOURCE_TYPES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex-1 min-w-[160px]">
              <label htmlFor="date-from" className="block text-sm font-medium text-gray-700 mb-1.5">From</label>
              <input
                id="date-from"
                type="date"
                value={dateFrom}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500 text-sm"
              />
            </div>

            <div className="flex-1 min-w-[160px]">
              <label htmlFor="date-to" className="block text-sm font-medium text-gray-700 mb-1.5">To</label>
              <input
                id="date-to"
                type="date"
                value={dateTo}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border-gray-300 shadow-sm focus:border-sky-500 focus:ring-sky-500 text-sm"
              />
            </div>

            <button
              onClick={handleClearFilters}
              className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Clear all
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500" />
          </div>
        ) : isError ? (
          <div className="text-center py-20">
            <p className="text-red-500 font-medium">Failed to load audit logs</p>
            <p className="text-gray-400 text-sm mt-1">
              {error instanceof Error ? error.message : 'Unknown error'}
            </p>
          </div>
        ) : !data?.items?.length ? (
          <div className="text-center py-20">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No audit logs found</p>
            <p className="text-gray-400 text-sm mt-1">
              Adjust your filters or check back later.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    User
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Resource Type
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Resource ID
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    IP Address
                  </th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Time
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {data.items.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-3 px-4 text-sm text-gray-700">{log.user_email}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${actionBadgeColor(log.action)}`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-600 capitalize">
                      {log.resource_type}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500 font-mono text-xs">
                      {log.resource_id?.length > 12
                        ? `${log.resource_id.slice(0, 12)}...`
                        : log.resource_id}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500 font-mono text-xs">
                      {log.ip_address}
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500 whitespace-nowrap">
                      {formatDate(log.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data && data.total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-gray-50">
            <p className="text-sm text-gray-500">
              Showing{' '}
              <span className="font-medium">{(page - 1) * pageSize + 1}</span> to{' '}
              <span className="font-medium">{Math.min(page * pageSize, data.total)}</span> of{' '}
              <span className="font-medium">{data.total}</span> results
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
