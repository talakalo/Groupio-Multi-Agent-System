'use client';

import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCircle, XCircle, AlertTriangle, Info, CheckCheck, Trash2 } from 'lucide-react';
import {
  useNotifications,
  useUnreadCount,
  useNotificationStore,
} from '@/lib/stores/notificationStore';
import { cn } from '@/lib/utils/cn';
import type { Notification, NotificationType } from '@/lib/stores/notificationStore';

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

// ---------------------------------------------------------------------------
// NotificationItem
// ---------------------------------------------------------------------------

function NotificationItem({
  notification,
  onRemove,
}: {
  notification: Notification;
  onRemove: (id: string) => void;
}) {
  const Icon = ICON_MAP[notification.type];

  return (
    <div className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group">
      <div className={cn('mt-0.5 shrink-0', ICON_COLOR_MAP[notification.type])}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 leading-snug">{notification.title}</p>
        {notification.message && (
          <p className="text-xs text-gray-500 mt-0.5 leading-snug">{notification.message}</p>
        )}
        <p className="text-[11px] text-gray-400 mt-1">{formatTime(notification.createdAt)}</p>
      </div>
      <button
        type="button"
        onClick={() => onRemove(notification.id)}
        className="shrink-0 opacity-0 group-hover:opacity-100 p-1 rounded-lg hover:bg-gray-200 transition-all"
        aria-label="הסר התראה"
      >
        <Trash2 className="h-3.5 w-3.5 text-gray-400" />
      </button>
      <span
        className={cn(
          'shrink-0 mt-1.5 h-2 w-2 rounded-full',
          DOT_COLOR_MAP[notification.type]
        )}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// NotificationPanel
// ---------------------------------------------------------------------------

export function NotificationPanel() {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const notifications = useNotifications();
  const unreadCount = useUnreadCount();
  const { markAllRead, clearNotifications, removeNotification } = useNotificationStore();

  // Close on outside click
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

  // Mark all read when panel opens
  useEffect(() => {
    if (open && unreadCount > 0) {
      markAllRead();
    }
  }, [open, unreadCount, markAllRead]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open]);

  return (
    <div ref={panelRef} className="relative">
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-xl transition-colors"
        aria-label="התראות"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <Bell className={cn('h-5 w-5', open && 'text-primary-600')} />
        {unreadCount > 0 && (
          <span className="absolute top-1.5 end-1.5 flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
          </span>
        )}
        {unreadCount === 0 && notifications.length === 0 && (
          <span className="absolute top-1.5 end-1.5 w-2 h-2 bg-red-500 rounded-full" />
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div
          className={cn(
            'absolute top-full mt-2 end-0 z-50',
            'w-80 bg-white rounded-2xl shadow-xl border border-gray-100',
            'animate-fade-in'
          )}
          role="dialog"
          aria-label="לוח התראות"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-900">התראות</h3>
            {notifications.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={markAllRead}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
                  title="סמן הכל כנקרא"
                >
                  <CheckCheck className="h-3.5 w-3.5" />
                  <span>סמן כנקרא</span>
                </button>
                <span className="text-gray-200">|</span>
                <button
                  type="button"
                  onClick={clearNotifications}
                  className="text-xs text-gray-500 hover:text-red-600 transition-colors"
                  title="נקה הכל"
                >
                  נקה הכל
                </button>
              </div>
            )}
          </div>

          {/* Notification list */}
          <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                <div className="h-12 w-12 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                  <Bell className="h-6 w-6 text-gray-300" />
                </div>
                <p className="text-sm font-medium text-gray-600">אין התראות חדשות</p>
                <p className="text-xs text-gray-400 mt-1">
                  כאן יופיעו העדכונים על הצעות ופעילות בבניין
                </p>
              </div>
            ) : (
              notifications.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  onRemove={removeNotification}
                />
              ))
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="border-t border-gray-100 px-4 py-2.5">
              <p className="text-xs text-center text-gray-400">
                {notifications.length} התראות
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
