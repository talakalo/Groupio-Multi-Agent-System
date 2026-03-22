'use client';

import { Bell, CheckCircle, XCircle, AlertTriangle, Info, CheckCheck, Trash2, Loader2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { apiClient } from '@/lib/api/client';
import { useAuthStore } from '@/lib/stores/authStore';
import type { NotificationType } from '@/lib/stores/notificationStore';
import { cn } from '@/lib/utils/cn';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ICON_MAP: Record<NotificationType, React.ElementType> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const ICON_COLOR_MAP: Record<NotificationType, string> = {
  success: 'text-green-500',
  error: 'text-red-500',
  warning: 'text-amber-500',
  info: 'text-blue-500',
};

const DOT_COLOR_MAP: Record<NotificationType, string> = {
  success: 'bg-green-400',
  error: 'bg-red-400',
  warning: 'bg-amber-400',
  info: 'bg-blue-400',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mapApiType(raw: string): NotificationType {
  const t = (raw || '').toLowerCase();
  if (t.includes('error') || t.includes('fail')) return 'error';
  if (t.includes('warn')) return 'warning';
  if (t.includes('success') || t.includes('paid') || t.includes('complete')) return 'success';
  return 'info';
}

function formatTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);

  if (diffSec < 60) return 'עכשיו';
  if (diffMin < 60) return `לפני ${diffMin} דקות`;
  if (diffHr < 24) return `לפני ${diffHr} שעות`;
  return date.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}

interface RowView {
  id: string;
  type: NotificationType;
  title: string;
  message: string | null;
  createdAt: Date;
  read: boolean;
}

// ---------------------------------------------------------------------------
// NotificationItem
// ---------------------------------------------------------------------------

function NotificationItem({
  row,
  onMarkReadAndRemove,
}: {
  row: RowView;
  onMarkReadAndRemove: (id: string) => void;
}) {
  const Icon = ICON_MAP[row.type];

  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group',
        !row.read && 'bg-primary-50/30',
      )}
    >
      <div className={cn('mt-0.5 shrink-0', ICON_COLOR_MAP[row.type])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 leading-snug">{row.title}</p>
        {row.message && (
          <p className="text-xs text-gray-500 mt-0.5 leading-snug">{row.message}</p>
        )}
        <p className="text-[11px] text-gray-400 mt-1">{formatTime(row.createdAt)}</p>
      </div>
      <button
        type="button"
        onClick={() => onMarkReadAndRemove(row.id)}
        className="shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-gray-200 transition-all"
        aria-label="סמן כנקרא"
      >
        <Trash2 className="h-3.5 w-3.5 text-gray-400" />
      </button>
      <span
        className={cn(
          'shrink-0 mt-1.5 h-2 w-2 rounded-full',
          row.read ? 'bg-gray-200' : DOT_COLOR_MAP[row.type],
        )}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// NotificationPanel (API-backed)
// ---------------------------------------------------------------------------

export function NotificationPanel() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const accessToken = useAuthStore((s) => s.accessToken);

  const [rows, setRows] = useState<RowView[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mapRows = useCallback((items: unknown[]) => {
    return items.map((raw) => {
      const n = raw as Record<string, unknown>;
      return {
        id: String(n.id),
        type: mapApiType(String(n.type ?? 'info')),
        title: String(n.title ?? ''),
        message: n.body != null ? String(n.body) : null,
        createdAt: new Date(String(n.created_at ?? Date.now())),
        read: Boolean(n.read),
      };
    });
  }, []);

  const refresh = useCallback(async () => {
    if (!accessToken) {
      setRows([]);
      setUnreadCount(0);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [list, uc] = await Promise.all([
        apiClient.getNotifications({ limit: 50, offset: 0 }),
        apiClient.getUnreadNotificationCount(),
      ]);
      setRows(mapRows(list.items as unknown[]));
      setUnreadCount(uc.count);
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'שגיאת רשת';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [accessToken, mapRows]);

  useEffect(() => {
    if (!accessToken) return;
    void refresh();
    const t = setInterval(() => {
      void apiClient.getUnreadNotificationCount().then((r) => setUnreadCount(r.count)).catch(() => {});
    }, 60_000);
    return () => clearInterval(t);
  }, [accessToken, refresh]);

  useEffect(() => {
    if (open && accessToken) {
      void refresh();
    }
  }, [open, accessToken, refresh]);

  useEffect(() => {
    if (!open) return;

    function handleClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  const handleMarkAllRead = async () => {
    const prev = rows;
    const prevUnread = unreadCount;
    setRows((r) => r.map((x) => ({ ...x, read: true })));
    setUnreadCount(0);
    try {
      await apiClient.markAllNotificationsRead();
    } catch {
      setRows(prev);
      setUnreadCount(prevUnread);
      setError('לא ניתן לסמן הכל כנקרא. נסו שוב.');
    }
  };

  const handleMarkOne = async (id: string) => {
    const prev = rows;
    const wasUnread = rows.find((r) => r.id === id)?.read === false;
    setRows((r) => r.map((x) => (x.id === id ? { ...x, read: true } : x)));
    if (wasUnread) setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await apiClient.markNotificationRead(id);
    } catch {
      setRows(prev);
      if (wasUnread) setUnreadCount((c) => c + 1);
      setError('לא ניתן לעדכן התראה. נסו שוב.');
    }
  };

  const signedIn = Boolean(accessToken);

  return (
    <div ref={panelRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
        aria-label="התראות"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell className={cn('h-5 w-5', open && 'text-primary-600')} />
        {signedIn && unreadCount > 0 && (
          <span className="absolute top-1.5 end-1.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
        )}
      </button>

      {open && (
        <div
          className={cn(
            'absolute top-full mt-2 end-0 z-50',
            'w-80 bg-white rounded-2xl shadow-xl border border-gray-100',
            'animate-fade-in',
          )}
          role="dialog"
          aria-label="לוח התראות"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">התראות</h3>
            {signedIn && rows.length > 0 && (
              <button
                type="button"
                onClick={() => void handleMarkAllRead()}
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                title="סמן הכל כנקרא"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>סמן כנקרא</span>
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {!signedIn && (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                <p className="text-sm text-gray-600">התחברו כדי לראות התראות מהשרת</p>
              </div>
            )}
            {signedIn && loading && rows.length === 0 && (
              <div className="flex items-center justify-center gap-2 py-10 text-gray-500 text-sm">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
                טוען…
              </div>
            )}
            {signedIn && error && (
              <div className="px-4 py-3 text-sm text-red-600 text-center" role="alert">
                {error}
                <button
                  type="button"
                  className="block mx-auto mt-2 text-xs text-primary-600 underline"
                  onClick={() => void refresh()}
                >
                  נסו שוב
                </button>
              </div>
            )}
            {signedIn && !loading && !error && rows.length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                  <Bell className="h-6 w-6 text-gray-300" />
                </div>
                <p className="text-sm font-medium text-gray-600">אין התראות</p>
                <p className="text-xs text-gray-400 mt-1">
                  עדכונים על הצעות ופעילות יופיעו כאן
                </p>
              </div>
            )}
            {signedIn &&
              rows.map((row) => (
                <NotificationItem key={row.id} row={row} onMarkReadAndRemove={(id) => void handleMarkOne(id)} />
              ))}
          </div>

          {signedIn && rows.length > 0 && (
            <div className="border-t border-gray-100 px-4 py-2.5">
              <p className="text-xs text-center text-gray-400">{rows.length} התראות</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
