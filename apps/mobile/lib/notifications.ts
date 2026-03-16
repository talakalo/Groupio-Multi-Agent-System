import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { storage } from './storage';
import { getAuthToken } from './api';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:8000';

// Configure notification handling
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export interface PushTokenResult {
  token: string | null;
  error?: string;
}

/**
 * Register for push notifications and get the token
 */
export async function registerForPushNotifications(): Promise<PushTokenResult> {
  // Only works on physical devices
  if (!Device.isDevice) {
    return {
      token: null,
      error: 'Push notifications require a physical device',
    };
  }

  // Check existing permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  // Request permission if not granted
  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    return {
      token: null,
      error: 'Push notification permission not granted',
    };
  }

  // Get the token
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: process.env.EXPO_PUBLIC_PROJECT_ID,
    });

    // Configure Android channel
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#0ea5e9',
      });

      await Notifications.setNotificationChannelAsync('offers', {
        name: 'Offers',
        description: 'New offer notifications',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#0ea5e9',
      });

      await Notifications.setNotificationChannelAsync('chat', {
        name: 'Chat',
        description: 'Chat message notifications',
        importance: Notifications.AndroidImportance.DEFAULT,
      });

      await Notifications.setNotificationChannelAsync('orders', {
        name: 'Orders',
        description: 'Order status updates',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#1a9a76',
      });

      await Notifications.setNotificationChannelAsync('payments', {
        name: 'Payments',
        description: 'Payment confirmations',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: '#1a9a76',
      });
    }

    return { token: tokenData.data };
  } catch (error) {
    return {
      token: null,
      error: error instanceof Error ? error.message : 'Failed to get push token',
    };
  }
}

/**
 * Send push token to backend for storage
 */
export async function sendPushTokenToServer(token: string): Promise<boolean> {
  try {
    const user = await storage.getUser();
    if (!user) {
      console.warn('No user found, cannot register push token');
      return false;
    }

    const authToken = getAuthToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (authToken) {
      headers['Authorization'] = `Bearer ${authToken}`;
    }

    const response = await fetch(`${API_URL}/api/v1/users/push-token`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        user_id: user.id,
        token,
        platform: Platform.OS,
        device_name: Device.deviceName,
      }),
    });

    return response.ok;
  } catch (error) {
    console.error('Failed to send push token to server:', error);
    return false;
  }
}

/**
 * Add notification listeners
 */
export function addNotificationListeners(
  onNotificationReceived?: (notification: Notifications.Notification) => void,
  onNotificationResponse?: (response: Notifications.NotificationResponse) => void
) {
  const receivedSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      console.log('Notification received:', notification);
      onNotificationReceived?.(notification);
    }
  );

  const responseSubscription = Notifications.addNotificationResponseReceivedListener(
    (response) => {
      console.log('Notification response:', response);
      onNotificationResponse?.(response);
    }
  );

  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
}

/**
 * Schedule a local notification
 */
export async function scheduleLocalNotification(
  title: string,
  body: string,
  data?: Record<string, unknown>,
  trigger?: Notifications.NotificationTriggerInput
): Promise<string> {
  const settings = await storage.getSettings();
  if (!settings.notifications) {
    return '';
  }

  const notifType = (data?.type as NotificationType) ?? undefined;
  const channelId =
    Platform.OS === 'android' && notifType
      ? getChannelForType(notifType)
      : undefined;

  return await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: true,
      ...(channelId ? { channelId } : {}),
    },
    trigger: trigger || null,
  });
}

/**
 * Cancel a scheduled notification
 */
export async function cancelNotification(notificationId: string): Promise<void> {
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}

/**
 * Cancel all scheduled notifications
 */
export async function cancelAllNotifications(): Promise<void> {
  await Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Get badge count
 */
export async function getBadgeCount(): Promise<number> {
  return await Notifications.getBadgeCountAsync();
}

/**
 * Set badge count
 */
export async function setBadgeCount(count: number): Promise<void> {
  await Notifications.setBadgeCountAsync(count);
}

/**
 * Clear badge
 */
export async function clearBadge(): Promise<void> {
  await setBadgeCount(0);
}

/**
 * Notification types for the app
 */
export type NotificationType =
  | 'new_offer'
  | 'offer_update'
  | 'order_status'
  | 'payment_confirmed'
  | 'contractor_matched'
  | 'chat_message'
  | 'escalation'
  | 'escalation_resolved'
  | 'building_invite'
  | 'project_update';

/**
 * Expected shape of notification data payload.
 * The backend should include `type` plus relevant IDs.
 */
export interface NotificationData {
  type: NotificationType;
  offerId?: string;
  orderId?: string;
  escalationId?: string;
  buildingId?: string;
  projectId?: string;
  [key: string]: unknown;
}

/**
 * Resolve a deep-link route string from notification data.
 */
export function getDeepLinkFromNotification(
  notification: Notifications.Notification,
): string | null {
  const data = notification.request.content.data as NotificationData | undefined;
  return data ? resolveRoute(data) : null;
}

/**
 * Resolve a deep-link from a notification response (user tapped).
 */
export function getDeepLinkFromResponse(
  response: Notifications.NotificationResponse,
): string | null {
  const data = response.notification.request.content.data as
    | NotificationData
    | undefined;
  return data ? resolveRoute(data) : null;
}

/**
 * Core routing logic: maps notification type + IDs → Expo Router path.
 */
function resolveRoute(data: NotificationData): string | null {
  if (!data.type) return null;

  switch (data.type) {
    case 'new_offer':
    case 'offer_update':
      return data.offerId
        ? `/offer-detail?id=${data.offerId}`
        : '/offers';

    case 'order_status':
      return data.orderId
        ? `/order-detail?id=${data.orderId}`
        : '/orders';

    case 'payment_confirmed':
      return '/payments';

    case 'contractor_matched':
      return data.offerId
        ? `/offer-detail?id=${data.offerId}`
        : '/offers';

    case 'escalation':
    case 'escalation_resolved':
      return '/chat';

    case 'chat_message':
      return '/chat';

    case 'building_invite':
      return data.buildingId
        ? `/buildings/${data.buildingId}/join`
        : '/';

    case 'project_update':
      return data.offerId
        ? `/offer-detail?id=${data.offerId}`
        : '/contractor-projects';

    default:
      return null;
  }
}

/**
 * Handle a notification response by navigating to the appropriate screen.
 *
 * Usage in root layout:
 * ```
 * import { router } from 'expo-router';
 * import { handleNotificationNavigation } from '../lib/notifications';
 *
 * addNotificationListeners(undefined, (response) => {
 *   handleNotificationNavigation(response, router);
 * });
 * ```
 */
export function handleNotificationNavigation(
  response: Notifications.NotificationResponse,
  navigate: { push: (href: string) => void },
): void {
  const route = getDeepLinkFromResponse(response);
  if (route) {
    navigate.push(route);
  }
}

/**
 * Map notification types → Android notification channels.
 * Ensures notifications are routed to the correct channel for user control.
 */
const NOTIFICATION_CHANNEL_MAP: Record<NotificationType, string> = {
  new_offer: 'offers',
  offer_update: 'offers',
  order_status: 'orders',
  payment_confirmed: 'payments',
  contractor_matched: 'offers',
  chat_message: 'chat',
  escalation: 'default',
  escalation_resolved: 'default',
  building_invite: 'default',
  project_update: 'orders',
};

/**
 * Get the Android notification channel for a notification type.
 */
export function getChannelForType(type: NotificationType): string {
  return NOTIFICATION_CHANNEL_MAP[type] ?? 'default';
}

/**
 * Set up notification listeners with automatic deep-link navigation.
 * Also manages badge count: increments on receive, clears on tap.
 * Returns a cleanup function to remove all listeners.
 */
export function setupNotificationNavigation(
  navigate: { push: (href: string) => void },
  onReceived?: (notification: Notifications.Notification) => void,
): () => void {
  const receivedSub = Notifications.addNotificationReceivedListener(
    async (notification) => {
      const current = await getBadgeCount();
      await setBadgeCount(current + 1);
      onReceived?.(notification);
    },
  );

  const responseSub =
    Notifications.addNotificationResponseReceivedListener(async (response) => {
      await clearBadge();
      handleNotificationNavigation(response, navigate);
    });

  Notifications.getLastNotificationResponseAsync().then(async (response) => {
    if (response) {
      await clearBadge();
      handleNotificationNavigation(response, navigate);
    }
  });

  return () => {
    receivedSub.remove();
    responseSub.remove();
  };
}
