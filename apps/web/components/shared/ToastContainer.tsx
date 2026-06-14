'use client';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

import { useNotifications, useNotificationStore } from '@/lib/stores/notificationStore';
import type { NotificationType } from '@/lib/stores/notificationStore';
import { cn } from '@/lib/utils/cn';

const ICON_MAP: Record<NotificationType, React.ElementType> = {
  success: CheckCircle,
  error: XCircle,
  warning: AlertTriangle,
  info: Info,
};

const COLOR_MAP: Record<NotificationType, string> = {
  success: 'bg-green-50 border-green-200 text-green-800',
  error: 'bg-red-50 border-red-200 text-red-800',
  warning: 'bg-amber-50 border-amber-200 text-amber-800',
  info: 'bg-blue-50 border-blue-200 text-blue-800',
};

const ICON_COLOR_MAP: Record<NotificationType, string> = {
  success: 'text-green-500',
  error: 'text-red-500',
  warning: 'text-amber-500',
  info: 'text-blue-500',
};

export function ToastContainer() {
  const notifications = useNotifications();
  const removeNotification = useNotificationStore((s) => s.removeNotification);

  return (
    <div
      className="fixed bottom-4 end-4 z-[9999] flex flex-col gap-2 max-w-sm w-full pointer-events-none"
      aria-live="polite"
      aria-label="Notifications"
    >
      {notifications.map((n) => {
        const Icon = ICON_MAP[n.type];
        return (
          <div
            key={n.id}
            className={cn(
              'flex items-start gap-3 p-4 rounded-xl border shadow-lg pointer-events-auto',
              'animate-slide-up',
              COLOR_MAP[n.type]
            )}
            role="alert"
          >
            <Icon className={cn('h-5 w-5 mt-0.5 shrink-0', ICON_COLOR_MAP[n.type])} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold leading-snug">{n.title}</p>
              {n.message && (
                <p className="text-xs mt-0.5 opacity-80 leading-snug">{n.message}</p>
              )}
              {n.action && (
                <button
                  type="button"
                  onClick={() => {
                    n.action?.onClick();
                    removeNotification(n.id);
                  }}
                  className="mt-1.5 text-xs font-medium underline underline-offset-2 hover:no-underline"
                >
                  {n.action.label}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => removeNotification(n.id)}
              className="shrink-0 p-0.5 rounded-lg hover:bg-black/10 transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
