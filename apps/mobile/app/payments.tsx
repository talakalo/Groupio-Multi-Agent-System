import { useRouter } from "expo-router";
import React, { useCallback } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { Text, Chip, useTheme, ActivityIndicator , IconButton } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

import type { PaymentRecord } from "../lib/api";
import { usePayments } from "../lib/hooks";
import i18n from "../lib/i18n";

const STATUS_CONFIG: Record<
  PaymentRecord["status"],
  { i18nKey: string; icon: string; colorKey: "tertiary" | "primary" | "error" | "secondary" }
> = {
  pending: { i18nKey: "payments.pending", icon: "clock-outline", colorKey: "secondary" },
  completed: { i18nKey: "payments.completed", icon: "check-circle", colorKey: "tertiary" },
  refunded: { i18nKey: "payments.refunded", icon: "cash-refund", colorKey: "primary" },
  failed: { i18nKey: "payments.failed", icon: "close-circle", colorKey: "error" },
};

export default function PaymentsScreen() {
  const theme = useTheme();
  const router = useRouter();

  const {
    data: paymentsData,
    isLoading,
    isFetching,
    refetch,
  } = usePayments();
  const payments = paymentsData?.data ?? [];

  const renderPayment = useCallback(
    ({ item }: { item: PaymentRecord }) => {
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
        <View
          style={[styles.paymentCard, { backgroundColor: theme.colors.surface }]}
        >
          <View style={styles.paymentHeader}>
            <View style={styles.paymentInfo}>
              <Text
                variant="titleSmall"
                style={{ color: theme.colors.onSurface, fontWeight: "700" }}
                numberOfLines={1}
              >
                {item.description}
              </Text>
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}
              >
                {new Date(item.createdAt).toLocaleDateString("he-IL", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </Text>
            </View>
            <View style={styles.paymentAmount}>
              <Text
                variant="titleMedium"
                style={{ color: theme.colors.primary, fontWeight: "800" }}
              >
                ₪{item.amount.toLocaleString()}
              </Text>
              <Chip
                compact
                icon={() => (
                  <Icon name={cfg.icon} size={14} color={statusColor} />
                )}
                style={{
                  backgroundColor: containerColor,
                  marginTop: 4,
                }}
                textStyle={{ color: statusColor, fontSize: 11 }}
              >
                {i18n.t(cfg.i18nKey)}
              </Chip>
            </View>
          </View>
          {item.method && (
            <View style={styles.methodRow}>
              <Icon
                name="credit-card"
                size={14}
                color={theme.colors.outline}
              />
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.outline, marginStart: 4 }}
              >
                {item.method}
              </Text>
            </View>
          )}
        </View>
      );
    },
    [theme],
  );

  const keyExtractor = useCallback(
    (item: PaymentRecord) => item.id,
    [],
  );

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          { borderBottomColor: theme.colors.outlineVariant },
        ]}
      >
        <IconButton icon="arrow-right" onPress={() => router.back()} />
        <Text
          variant="titleLarge"
          style={{
            fontWeight: "700",
            color: theme.colors.onSurface,
            flex: 1,
            textAlign: "center",
          }}
        >
          {i18n.t("payments.title")}
        </Text>
        <View style={{ width: 48 }} />
      </View>

      <FlatList
        data={payments}
        renderItem={renderPayment}
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
          isLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
            </View>
          ) : (
            <View style={styles.emptyState}>
              <Icon
                name="credit-card-off-outline"
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
                {i18n.t("payments.noPayments")}
              </Text>
              <Text
                variant="bodyMedium"
                style={{
                  color: theme.colors.onSurfaceVariant,
                  textAlign: "center",
                }}
              >
                {i18n.t("payments.historyWillAppear")}
              </Text>
            </View>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  listContent: { padding: 16, paddingBottom: 32 },
  separator: { height: 10 },
  paymentCard: {
    borderRadius: 14,
    padding: 16,
    elevation: 1,
  },
  paymentHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  paymentInfo: { flex: 1, marginEnd: 12 },
  paymentAmount: { alignItems: "flex-end" },
  methodRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
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
  loadingState: {
    paddingVertical: 80,
    alignItems: "center",
  },
});
