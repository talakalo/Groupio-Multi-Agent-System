"use client";

import { useCallback, useMemo, useState } from "react";
import { clsx } from "clsx";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Loader2,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (item: T) => React.ReactNode;
}

export interface PaginationConfig {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField: keyof T;
  loading?: boolean;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onSelectionChange?: (ids: Set<string>) => void;
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
  pagination?: PaginationConfig;
  emptyMessage?: string;
}

// ---------------------------------------------------------------------------
// SortIcon
// ---------------------------------------------------------------------------

function SortIcon({ active, dir }: { active: boolean; dir?: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown className="w-3.5 h-3.5 text-surface-300" />;
  return dir === "asc" ? (
    <ArrowUp className="w-3.5 h-3.5 text-primary-600" />
  ) : (
    <ArrowDown className="w-3.5 h-3.5 text-primary-600" />
  );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

function TablePagination({ config }: { config: PaginationConfig }) {
  const { page, pageSize, total, onPageChange } = config;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-surface-100 text-sm text-surface-500">
      <span>
        {total > 0
          ? `${from}–${to} of ${total}`
          : "No results"}
      </span>
      <div className="flex items-center gap-1">
        <button
          className="btn-ghost btn-sm rounded-md disabled:opacity-30"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="px-2 text-xs font-medium text-surface-600">
          {page} / {totalPages}
        </span>
        <button
          className="btn-ghost btn-sm rounded-md disabled:opacity-30"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mobile Card View
// ---------------------------------------------------------------------------

function MobileCardView<T>({
  columns,
  data,
  keyField,
  selectable,
  selectedIds,
  onToggle,
}: {
  columns: Column<T>[];
  data: T[];
  keyField: keyof T;
  selectable?: boolean;
  selectedIds?: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3 md:hidden">
      {data.map((row) => {
        const id = String(row[keyField]);
        const isSelected = selectedIds?.has(id);
        return (
          <div
            key={id}
            className={clsx(
              "card p-4 space-y-2",
              isSelected && "ring-2 ring-primary-300"
            )}
          >
            {selectable && (
              <label className="flex items-center gap-2 text-xs text-surface-500">
                <input
                  type="checkbox"
                  checked={isSelected ?? false}
                  onChange={() => onToggle(id)}
                  className="rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                />
                Select
              </label>
            )}
            {columns.map((col) => (
              <div key={col.key} className="flex justify-between text-sm">
                <span className="font-medium text-surface-500">{col.label}</span>
                <span className="text-surface-800">
                  {col.render
                    ? col.render(row)
                    : String((row as Record<string, unknown>)[col.key] ?? "—")}
                </span>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DataTable
// ---------------------------------------------------------------------------

export function DataTable<T>({
  columns,
  data,
  keyField,
  loading = false,
  selectable = false,
  selectedIds,
  onSelectionChange,
  sortKey,
  sortDir,
  onSort,
  pagination,
  emptyMessage = "No data available",
}: DataTableProps<T>) {
  const [internalSelected, setInternalSelected] = useState<Set<string>>(
    new Set()
  );
  const selected = selectedIds ?? internalSelected;
  const setSelected = onSelectionChange ?? setInternalSelected;

  const allIds = useMemo(
    () => data.map((row) => String(row[keyField])),
    [data, keyField]
  );

  const allSelected = allIds.length > 0 && allIds.every((id) => selected.has(id));

  const toggleRow = useCallback(
    (id: string) => {
      const next = new Set(selected);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelected(next);
    },
    [selected, setSelected]
  );

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allIds));
    }
  }, [allSelected, allIds, setSelected]);

  if (loading) {
    return (
      <div className="card flex items-center justify-center py-16 text-surface-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="card flex flex-col items-center justify-center py-16 text-surface-400 gap-2">
        <Inbox className="w-8 h-8" />
        <span className="text-sm">{emptyMessage}</span>
      </div>
    );
  }

  return (
    <>
      {/* Mobile card view */}
      <MobileCardView
        columns={columns}
        data={data}
        keyField={keyField}
        selectable={selectable}
        selectedIds={selected}
        onToggle={toggleRow}
      />

      {/* Desktop table view */}
      <div className="hidden md:block table-container">
        <table className="w-full">
          <thead>
            <tr>
              {selectable && (
                <th className="table-header w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleAll}
                    className="rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={clsx(
                    "table-header",
                    col.sortable && "cursor-pointer select-none hover:text-surface-700"
                  )}
                  onClick={col.sortable && onSort ? () => onSort(col.key) : undefined}
                >
                  <span className="flex items-center gap-1.5">
                    {col.label}
                    {col.sortable && (
                      <SortIcon active={sortKey === col.key} dir={sortKey === col.key ? sortDir : undefined} />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => {
              const id = String(row[keyField]);
              return (
                <tr key={id} className="table-row">
                  {selectable && (
                    <td className="table-cell w-10">
                      <input
                        type="checkbox"
                        checked={selected.has(id)}
                        onChange={() => toggleRow(id)}
                        className="rounded border-surface-300 text-primary-600 focus:ring-primary-500"
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.key} className="table-cell">
                      {col.render
                        ? col.render(row)
                        : String((row as Record<string, unknown>)[col.key] ?? "—")}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
        {pagination && <TablePagination config={pagination} />}
      </div>

      {/* Mobile pagination */}
      {pagination && (
        <div className="md:hidden">
          <TablePagination config={pagination} />
        </div>
      )}
    </>
  );
}
