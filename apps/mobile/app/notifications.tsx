import { Stack } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  Divider,
  HelperText,
  IconButton,
  Text,
  useTheme,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  ApiError,
  NotificationItem,
  deleteNotification,
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "../lib/api";
import i18n from "../lib/i18n";

const PAGE_SIZE = 20;

export default function NotificationsScreen() {
  const theme = useTheme();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actioning, setActioning] = useState<string | null>(null);
  const offsetRef = useRef(0);

  const load = useCallback(async (reset = false) => {
    setError(null);
    const offset = reset ? 0 : offsetRef.current;
    try {
      const data = await getNotifications({ limit: PAGE_SIZE, offset });
      setTotal(data.total);
      if (reset) {
        setItems(data.items);
        offsetRef.current = data.items.length;
      } else {
        setItems((prev) => [...prev, ...data.items]);
        offsetRef.current = offset + data.items.length;
      }
    } catch (err: unknown) {
      setError(
        err instanceof ApiError
          ? err.message
          : i18n.t("notifications.loadFailed") || "Failed to load notifications",
      );
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load(true);
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }

  async function onEndReached() {
    if (loadingMore || items.length >= total) return;
    setLoadingMore(true);
    await load(false);
    setLoadingMore(false);
  }

  async function handleMarkRead(notif: NotificationItem) {
    if (notif.isRead) return;
    setActioning(notif.id);
    try {
      await markNotificationRead(notif.id);
      setItems((prev) =>
        prev.map((n) =>
          n.id === notif.id ? { ...n, isRead: true } : n,
        ),
      );
    } catch (err: unknown) {
      setError(
        err instanceof ApiError
          ? err.message
          : i18n.t("notifications.markFailed") || "Failed to mark read",
      );
    } finally {
      setActioning(null);
    }
  }

  async function handleMarkAll() {
    setActioning("all");
    try {
      await markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch (err: unknown) {
      setError(
        err instanceof ApiError
          ? err.message
          : i18n.t("notifications.markFailed") || "Failed",
      );
    } finally {
      setActioning(null);
    }
  }

  async function handleDelete(notif: NotificationItem) {
    setActioning(notif.id);
    try {
      await deleteNotification(notif.id);
      setItems((prev) => prev.filter((n) => n.id !== notif.id));
      setTotal((t) => t - 1);
    } catch (err: unknown) {
      setError(
        err instanceof ApiError
          ? err.message
          : i18n.t("notifications.deleteFailed") || "Failed to delete",
      );
    } finally {
      setActioning(null);
    }
  }

  const unreadCount = items.filter((n) => !n.isRead).length;

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <Stack.Screen
          options={{ title: i18n.t("notifications.title") || "Notifications" }}
        />
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <Stack.Screen
        options={{ title: i18n.t("notifications.title") || "Notifications" }}
      />
      {error ? (
        <HelperText type="error" visible style={styles.error}>
          {error}
        </HelperText>
      ) : null}
      {unreadCount > 0 ? (
        <View style={styles.headerActions}>
          <Chip compact icon="bell-badge" style={styles.unreadChip}>
            {i18n.t("notifications.unreadCount", { count: unreadCount }) ||
              `${unreadCount} unread`}
          </Chip>
          <Button
            mode="text"
            onPress={handleMarkAll}
            disabled={actioning === "all"}
            testID="notifications-mark-all"
          >
            {i18n.t("notifications.markAll") || "Mark all read"}
          </Button>
        </View>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(n) => n.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.3}
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footerLoader}>
              <ActivityIndicator size="small" />
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <Card
            mode={item.isRead ? "outlined" : "contained"}
            style={[
              styles.row,
              !item.isRead ? { backgroundColor: theme.colors.primaryContainer } : null,
            ]}
            onPress={() => handleMarkRead(item)}
            testID={`notification-${item.id}`}
          >
            <Card.Content>
              <View style={styles.rowHead}>
                <Text variant="titleSmall" style={styles.titleText} numberOfLines={1}>
                  {item.title || item.type || "Groupio"}
                </Text>
                <IconButton
                  icon="trash-can-outline"
                  size={18}
                  onPress={() => handleDelete(item)}
                  disabled={actioning === item.id}
                  accessibilityLabel={i18n.t("notifications.delete") || "Delete"}
                  testID={`notification-delete-${item.id}`}
                />
              </View>
              {item.body ? (
                <Text variant="bodySmall" style={styles.body}>
                  {item.body}
                </Text>
              ) : null}
              <Text style={styles.muted}>
                {new Date(item.createdAt).toLocaleString()}
              </Text>
            </Card.Content>
          </Card>
        )}
        ItemSeparatorComponent={() => <Divider />}
        ListEmptyComponent={
          !error ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.muted}>
                {i18n.t("notifications.empty") ||
                  "You're all caught up — no notifications yet."}
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { padding: 16, paddingBottom: 32 },
  row: { marginBottom: 8 },
  rowHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  titleText: { flex: 1, fontWeight: "600" },
  body: { marginTop: 4 },
  muted: { opacity: 0.6, marginTop: 4 },
  error: { textAlign: "center" },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  unreadChip: { alignSelf: "flex-start" },
  emptyWrap: { padding: 24, alignItems: "center" },
  footerLoader: { paddingVertical: 16, alignItems: "center" },
});
