import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { storage } from './storage';

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

    const response = await fetch(`${API_URL}/api/v1/users/push-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Add auth header here
      },
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
    console.log('Notifications disabled by user');
    return '';
  }

  return await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data,
      sound: true,
    },
    trigger: trigger || null, // null means immediate
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
  | 'contractor_matched'
  | 'chat_message'
  | 'escalation_resolved'
  | 'building_invite';

/**
 * Handle deep link from notification
 */
export function getDeepLinkFromNotification(
  notification: Notifications.Notification
): string | null {
  const data = notification.request.content.data;

  if (!data || !data.type) {
    return null;
  }

  const type = data.type as NotificationType;

  switch (type) {
    case 'new_offer':
    case 'offer_update':
      return data.offerId ? `/offers/${data.offerId}` : '/offers';

    case 'contractor_matched':
      return data.offerId ? `/offers/${data.offerId}` : '/offers';

    case 'chat_message':
      return '/chat';

    case 'escalation_resolved':
      return data.escalationId ? `/escalations/${data.escalationId}` : '/';

    case 'building_invite':
      return data.buildingId ? `/buildings/${data.buildingId}/join` : '/';

    default:
      return null;
  }
}
