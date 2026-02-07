import { create } from 'zustand';

export type NotificationType = 'success' | 'error' | 'warning' | 'info';

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message?: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
  createdAt: Date;
}

interface NotificationState {
  notifications: Notification[];
  unreadCount: number;

  // Actions
  addNotification: (notification: Omit<Notification, 'id' | 'createdAt'>) => string;
  removeNotification: (id: string) => void;
  clearNotifications: () => void;
  markAllRead: () => void;

  // Convenience methods
  success: (title: string, message?: string) => string;
  error: (title: string, message?: string) => string;
  warning: (title: string, message?: string) => string;
  info: (title: string, message?: string) => string;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,

  addNotification: (notification) => {
    const id = generateId();
    const newNotification: Notification = {
      ...notification,
      id,
      createdAt: new Date(),
    };

    set((state) => ({
      notifications: [newNotification, ...state.notifications].slice(0, 50), // Keep max 50
      unreadCount: state.unreadCount + 1,
    }));

    // Auto-remove after duration
    const duration = notification.duration || 5000;
    if (duration > 0) {
      setTimeout(() => {
        get().removeNotification(id);
      }, duration);
    }

    return id;
  },

  removeNotification: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),

  clearNotifications: () =>
    set({
      notifications: [],
      unreadCount: 0,
    }),

  markAllRead: () =>
    set({
      unreadCount: 0,
    }),

  success: (title, message) =>
    get().addNotification({ type: 'success', title, message }),

  error: (title, message) =>
    get().addNotification({ type: 'error', title, message, duration: 8000 }),

  warning: (title, message) =>
    get().addNotification({ type: 'warning', title, message }),

  info: (title, message) =>
    get().addNotification({ type: 'info', title, message }),
}));

// Selector hooks
export const useNotifications = () =>
  useNotificationStore((state) => state.notifications);
export const useUnreadCount = () =>
  useNotificationStore((state) => state.unreadCount);

// Convenience hooks
export const useNotify = () => {
  const store = useNotificationStore();
  return {
    success: store.success,
    error: store.error,
    warning: store.warning,
    info: store.info,
  };
};
