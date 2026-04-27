import { Stack } from "expo-router";
import React, { useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Card,
  Chip,
  Divider,
  HelperText,
  Text,
  useTheme,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  ApiError,
  ContractorEarnings,
  getContractorEarnings,
} from "../lib/api";
import i18n from "../lib/i18n";

/**
 * Mobile contractor earnings — parity with apps/web/app/contractor/earnings.
 *
 * Shows total earnings, pending payouts, and the line-item history. Each
 * row is a payment with amount/currency/status; pull-to-refresh reloads.
 */
export default function ContractorEarningsScreen() {
  const theme = useTheme();
  const [data, setData] = useState<ContractorEarnings | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    try {
      const e = await getContractorEarnings();
      setData(e);
    } catch (err: unknown) {
      setError(
        err instanceof ApiError
          ? err.message
          : i18n.t("contractor.earningsLoadFailed") ||
              "Failed to load earnings",
      );
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  function formatAmount(amount: number, currency: string) {
    try {
      return new Intl.NumberFormat("he-IL", {
        style: "currency",
        currency: currency || "ILS",
      }).format(amount);
    } catch {
      return `${amount} ${currency}`;
    }
  }

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <Stack.Screen
          options={{ title: i18n.t("contractor.earningsTitle") || "Earnings" }}
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
        options={{ title: i18n.t("contractor.earningsTitle") || "Earnings" }}
      />
      <FlatList
        data={data?.items ?? []}
        keyExtractor={(item) => item.payment_id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListHeaderComponent={
          <View testID="contractor-earnings-header">
            {error ? (
              <HelperText type="error" visible style={styles.error}>
                {error}
              </HelperText>
            ) : null}
            <Card style={styles.summaryCard} mode="contained">
              <Card.Content>
                <Text variant="labelLarge">
                  {i18n.t("contractor.totalEarnings") || "Total earnings"}
                </Text>
                <Text variant="headlineMedium" style={styles.amount}>
                  {formatAmount(data?.total_earnings ?? 0, "ILS")}
                </Text>
                <Divider style={styles.divider} />
                <Text variant="labelLarge">
                  {i18n.t("contractor.pendingPayouts") || "Pending payouts"}
                </Text>
                <Text variant="titleMedium">
                  {formatAmount(data?.pending_payouts ?? 0, "ILS")}
                </Text>
                {data?.current_period ? (
                  <Text style={styles.muted}>
                    {i18n.t("contractor.currentPeriod") || "Current period"}:{" "}
                    {new Date(data.current_period.start).toLocaleDateString()} —{" "}
                    {new Date(data.current_period.end).toLocaleDateString()}
                  </Text>
                ) : null}
              </Card.Content>
            </Card>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              {i18n.t("contractor.history") || "History"}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Card style={styles.row} mode="outlined" testID={`earnings-row-${item.payment_id}`}>
            <Card.Content>
              <View style={styles.rowHead}>
                <Text variant="titleSmall" numberOfLines={1}>
                  {item.offer_title ?? item.offer_id ?? item.payment_id}
                </Text>
                <Chip compact mode="flat" style={styles.statusChip}>
                  {item.status}
                </Chip>
              </View>
              <Text variant="bodyMedium">
                {formatAmount(item.amount, item.currency || "ILS")}
              </Text>
              {item.paid_at ? (
                <Text style={styles.muted}>
                  {new Date(item.paid_at).toLocaleString()}
                </Text>
              ) : null}
            </Card.Content>
          </Card>
        )}
        ListEmptyComponent={
          !error ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.muted}>
                {i18n.t("contractor.noEarnings") ||
                  "No earnings yet. Completed projects will appear here."}
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
  summaryCard: { marginBottom: 16 },
  amount: { marginVertical: 4, fontWeight: "700" },
  divider: { marginVertical: 12 },
  muted: { opacity: 0.6, marginTop: 4 },
  sectionTitle: { marginBottom: 8, fontWeight: "600" },
  row: { marginBottom: 8 },
  rowHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  statusChip: { marginStart: 8 },
  emptyWrap: { padding: 24, alignItems: "center" },
  error: { textAlign: "center" },
});
