import { useRouter } from "expo-router";
import React, { useCallback } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  Pressable,
} from "react-native";
import { Text, Chip, useTheme } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

import type { Order } from "../../lib/api";
import { useOrders } from "../../lib/hooks";
import i18n from "../../lib/i18n";

const STATUS_CONFIG: Record<
  Order["status"],
  { i18nKey: string; icon: string; colorKey: "tertiary" | "primary" | "error" | "secondary" }
> = {
  pending: { i18nKey: "orders.pending", icon: "clock-outline", colorKey: "secondary" },
  confirmed: { i18nKey: "orders.confirmed", icon: "check-circle-outline", colorKey: "primary" },
  in_progress: { i18nKey: "orders.inProgress", icon: "progress-wrench", colorKey: "primary" },
  completed: { i18nKey: "orders.completed", icon: "check-all", colorKey: "tertiary" },
  cancelled: { i18nKey: "orders.cancelled", icon: "close-circle-outline", colorKey: "error" },
};

export default function OrdersScreen() {
  const theme = useTheme();
  const router = useRouter();

  const { data: ordersData, isLoading, isFetching, refetch } = useOrders();
  const orders = ordersData?.data ?? [];

  const handlePress = useCallback(
    (order: Order) => {
      router.push({ pathname: "/order-detail", params: { id: order.id } } as never);
    },
    [router],
  );

  const renderOrder = useCallback(
    ({ item }: { item: Order }) => {
      const cfg = STATUS_CONFIG[item.status];
      const statusColor = theme.colors[cfg.colorKey];
      const containerColor =
        cfg.colorKey === "tertiary"
          ? theme.colors.tertiaryContainer
          : cfg.colorKey === "error"
            ? theme.colors.errorContainer
            : cfg.colorKey === "secondary"
              ? theme.colors.secondaryContainer
              : theme.colors.primaryContainer;

      return (
        <Pressable
          style={[styles.orderCard, { backgroundColor: theme.colors.surface }]}
          onPress={() => handlePress(item)}
          android_ripple={{ color: theme.colors.primaryContainer }}
        >
          <View style={styles.orderHeader}>
            <Text
              variant="titleSmall"
              style={{ color: theme.colors.onSurface, fontWeight: "700", flex: 1 }}
              numberOfLines={1}
            >
              {item.offerTitle}
            </Text>
            <Chip
              compact
              icon={() => (
                <Icon name={cfg.icon} size={14} color={statusColor} />
              )}
              style={{ backgroundColor: containerColor }}
              textStyle={{ color: statusColor, fontSize: 12 }}
            >
              {i18n.t(cfg.i18nKey)}
            </Chip>
          </View>
          <View style={styles.orderMeta}>
            <View style={styles.metaItem}>
              <Icon
                name="account-hard-hat"
                size={16}
                color={theme.colors.onSurfaceVariant}
              />
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant, marginStart: 4 }}
              >
                {item.contractorName}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Icon
                name="calendar"
                size={16}
                color={theme.colors.onSurfaceVariant}
              />
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant, marginStart: 4 }}
              >
                {new Date(item.createdAt).toLocaleDateString("he-IL")}
              </Text>
            </View>
          </View>
          <View style={styles.orderFooter}>
            <Text
              variant="titleMedium"
              style={{ color: theme.colors.primary, fontWeight: "800" }}
            >
              ₪{item.amount.toLocaleString()}
            </Text>
            <Icon
              name="chevron-left"
              size={20}
              color={theme.colors.onSurfaceVariant}
            />
          </View>
        </Pressable>
      );
    },
    [theme, handlePress],
  );

  const keyExtractor = useCallback((item: Order) => item.id, []);

  return (
    <SafeAreaView
      edges={["bottom"]}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <FlatList
        data={orders}
        renderItem={renderOrder}
        keyExtractor={keyExtractor}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={() => refetch()}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          isLoading ? null : (
            <View style={styles.emptyState}>
              <Icon
                name="package-variant"
                size={64}
                color={theme.colors.outlineVariant}
              />
              <Text
                variant="titleMedium"
                style={[
                  styles.emptyTitle,
                  { color: theme.colors.onSurface },
                ]}
              >
                {i18n.t("orders.noOrders")}
              </Text>
              <Text
                variant="bodyMedium"
                style={{
                  color: theme.colors.onSurfaceVariant,
                  textAlign: "center",
                }}
              >
                {i18n.t("orders.ordersWillAppear")}
              </Text>
            </View>
          )
        }
      />

      {isLoading && (
        <View style={styles.loadingContainer}>
          {[1, 2, 3].map((i) => (
            <View
              key={i}
              style={[
                styles.skeleton,
                { backgroundColor: theme.colors.surfaceVariant },
              ]}
            />
          ))}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 32 },
  separator: { height: 10 },
  orderCard: {
    borderRadius: 14,
    padding: 16,
    elevation: 1,
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
    gap: 8,
  },
  orderMeta: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 10,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  orderFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontWeight: "700",
    marginTop: 16,
    textAlign: "center",
    marginBottom: 4,
  },
  loadingContainer: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    gap: 10,
  },
  skeleton: {
    height: 120,
    borderRadius: 14,
  },
});
