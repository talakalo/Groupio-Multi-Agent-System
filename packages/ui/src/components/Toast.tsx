import * as React from 'react';
import { createPortal } from 'react-dom';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextValue {
  toasts: Toast[];
  addToast: (toast: Omit<Toast, 'id'>) => void;
  removeToast: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast() {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const addToast = React.useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    const newToast = { ...toast, id };

    setToasts((prev) => [...prev, newToast]);

    // Auto-remove after duration
    const duration = toast.duration || 5000;
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, duration);
  }, []);

  const removeToast = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toasts, addToast, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

const toastStyles: Record<ToastType, { bg: string; icon: string; iconBg: string }> = {
  success: {
    bg: 'bg-green-50 border-green-200',
    icon: 'text-green-500',
    iconBg: 'bg-green-100',
  },
  error: {
    bg: 'bg-red-50 border-red-200',
    icon: 'text-red-500',
    iconBg: 'bg-red-100',
  },
  warning: {
    bg: 'bg-yellow-50 border-yellow-200',
    icon: 'text-yellow-500',
    iconBg: 'bg-yellow-100',
  },
  info: {
    bg: 'bg-blue-50 border-blue-200',
    icon: 'text-blue-500',
    iconBg: 'bg-blue-100',
  },
};

const icons: Record<ToastType, React.ReactNode> = {
  success: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  warning: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  ),
  info: (
    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  ),
};

function ToastContainer({
  toasts,
  removeToast,
}: {
  toasts: Toast[];
  removeToast: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  const content = (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );

  if (typeof window !== 'undefined') {
    return createPortal(content, document.body);
  }

  return content;
}

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  const style = toastStyles[toast.type];

  return (
    <div
      className={`flex w-80 items-start gap-3 rounded-lg border p-4 shadow-lg ${style.bg}`}
      role="alert"
    >
      <div className={`flex-shrink-0 rounded-full p-1 ${style.iconBg} ${style.icon}`}>
        {icons[toast.type]}
      </div>
      <div className="flex-1">
        <p className="font-medium text-gray-900">{toast.title}</p>
        {toast.message && <p className="mt-1 text-sm text-gray-600">{toast.message}</p>}
      </div>
      <button
        onClick={onClose}
        className="flex-shrink-0 rounded-lg p-1 text-gray-400 hover:bg-white/50 hover:text-gray-500"
        aria-label="Dismiss"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// Convenience hooks for common toast types
export function useSuccessToast() {
  const { addToast } = useToast();
  return (title: string, message?: string) =>
    addToast({ type: 'success', title, message });
}

export function useErrorToast() {
  const { addToast } = useToast();
  return (title: string, message?: string) =>
    addToast({ type: 'error', title, message });
}

export function useWarningToast() {
  const { addToast } = useToast();
  return (title: string, message?: string) =>
    addToast({ type: 'warning', title, message });
}

export function useInfoToast() {
  const { addToast } = useToast();
  return (title: string, message?: string) =>
    addToast({ type: 'info', title, message });
}
