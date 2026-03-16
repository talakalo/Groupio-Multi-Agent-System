import React from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import {
  Text,
  Button,
  Chip,
  Avatar,
  Divider,
  useTheme,
  ActivityIndicator,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

import { useOrder } from "../lib/hooks";
import type { Order, OrderTimelineEvent } from "../lib/api";
import i18n from "../lib/i18n";

const STATUS_I18N: Record<Order["status"], string> = {
  pending: "orders.pending",
  confirmed: "orders.confirmed",
  in_progress: "orders.inProgress",
  completed: "orders.completed",
  cancelled: "orders.cancelled",
};

const PAYMENT_I18N: Record<Order["paymentStatus"], string> = {
  pending: "orders.paymentPending",
  escrow: "orders.paymentEscrow",
  released: "orders.paymentReleased",
  refunded: "orders.paymentRefunded",
};

function TimelineItem({
  event,
  isLast,
}: {
  event: OrderTimelineEvent;
  isLast: boolean;
}) {
  const theme = useTheme();
  const iconColor =
    event.status === "completed"
      ? theme.colors.tertiary
      : event.status === "current"
        ? theme.colors.primary
        : theme.colors.outlineVariant;

  const iconName =
    event.status === "completed"
      ? "check-circle"
      : event.status === "current"
        ? "circle-slice-4"
        : "circle-outline";

  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineIconCol}>
        <Icon name={iconName} size={22} color={iconColor} />
        {!isLast && (
          <View
            style={[
              styles.timelineLine,
              { backgroundColor: theme.colors.outlineVariant },
            ]}
          />
        )}
      </View>
      <View style={styles.timelineContent}>
        <Text
          variant="bodyMedium"
          style={{
            color: theme.colors.onSurface,
            fontWeight: event.status === "current" ? "700" : "400",
          }}
        >
          {event.title}
        </Text>
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}
        >
          {event.description}
        </Text>
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.outline, marginTop: 4 }}
        >
          {new Date(event.timestamp).toLocaleDateString("he-IL", {
            day: "numeric",
            month: "short",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </Text>
      </View>
    </View>
  );
}

export default function OrderDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const {
    data: order,
    isLoading,
    isError,
  } = useOrder(id ?? "", { enabled: !!id });

  if (isLoading) {
    return (
      <SafeAreaView
        style={[styles.center, { backgroundColor: theme.colors.background }]}
      >
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  if (isError || !order) {
    return (
      <SafeAreaView
        style={[styles.center, { backgroundColor: theme.colors.background }]}
      >
        <Icon
          name="alert-circle-outline"
          size={48}
          color={theme.colors.error}
        />
        <Text
          variant="titleMedium"
          style={{ color: theme.colors.onSurface, marginTop: 12 }}
        >
          {i18n.t("orders.notFound")}
        </Text>
        <Button mode="text" onPress={() => router.back()} style={{ marginTop: 16 }}>
          {i18n.t("common.back")}
        </Button>
      </SafeAreaView>
    );
  }

  const statusLabel = i18n.t(STATUS_I18N[order.status]);
  const isActive = order.status === "in_progress" || order.status === "confirmed";

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
        <Button mode="text" compact icon="arrow-right" onPress={() => router.back()}>
          {i18n.t("common.back")}
        </Button>
        <Text
          variant="titleLarge"
          style={{ fontWeight: "700", color: theme.colors.onSurface }}
        >
          {i18n.t("orders.detail")}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Status & title */}
        <View style={styles.titleRow}>
          <Text
            variant="headlineSmall"
            style={{ color: theme.colors.onSurface, fontWeight: "700", flex: 1 }}
            numberOfLines={2}
          >
            {order.offerTitle}
          </Text>
          <Chip
            compact
            style={{
              backgroundColor: isActive
                ? theme.colors.primaryContainer
                : order.status === "completed"
                  ? theme.colors.tertiaryContainer
                  : theme.colors.errorContainer,
            }}
            textStyle={{
              color: isActive
                ? theme.colors.primary
                : order.status === "completed"
                  ? theme.colors.tertiary
                  : theme.colors.error,
            }}
          >
            {statusLabel}
          </Chip>
        </View>

        <Divider style={styles.divider} />

        {/* Contractor info */}
        <Text
          variant="titleMedium"
          style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
        >
          {i18n.t("orders.contractor")}
        </Text>
        <View style={styles.contractorRow}>
          <Avatar.Text
            size={44}
            label={order.contractorName.substring(0, 2)}
            style={{ backgroundColor: theme.colors.primaryContainer }}
            labelStyle={{ color: theme.colors.onPrimaryContainer }}
          />
          <View style={{ marginStart: 12, flex: 1 }}>
            <Text
              variant="titleSmall"
              style={{ color: theme.colors.onSurface, fontWeight: "700" }}
            >
              {order.contractorName}
            </Text>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {new Date(order.createdAt).toLocaleDateString("he-IL")}
            </Text>
          </View>
        </View>

        <Divider style={styles.divider} />

        {/* Payment info */}
        <Text
          variant="titleMedium"
          style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
        >
          {i18n.t("orders.payment")}
        </Text>
        <View
          style={[
            styles.paymentCard,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          <View style={styles.paymentRow}>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>{i18n.t("orders.amount")}</Text>
            <Text
              variant="titleMedium"
              style={{ color: theme.colors.primary, fontWeight: "800" }}
            >
              ₪{order.amount.toLocaleString()}
            </Text>
          </View>
          <View style={styles.paymentRow}>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>
              {i18n.t("orders.paymentStatus")}
            </Text>
            <Chip compact>
              {i18n.t(PAYMENT_I18N[order.paymentStatus])}
            </Chip>
          </View>
        </View>

        {/* Timeline */}
        {order.timeline && order.timeline.length > 0 && (
          <>
            <Divider style={styles.divider} />
            <Text
              variant="titleMedium"
              style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
            >
              {i18n.t("orders.timeline")}
            </Text>
            {order.timeline.map((event, idx) => (
              <TimelineItem
                key={event.id}
                event={event}
                isLast={idx === (order.timeline?.length ?? 0) - 1}
              />
            ))}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerSpacer: { width: 72 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  divider: { marginVertical: 16 },
  sectionTitle: { fontWeight: "700", marginBottom: 12 },
  contractorRow: { flexDirection: "row", alignItems: "center" },
  paymentCard: {
    borderRadius: 12,
    padding: 16,
    elevation: 1,
    gap: 12,
  },
  paymentRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  timelineRow: {
    flexDirection: "row",
    marginBottom: 4,
  },
  timelineIconCol: {
    alignItems: "center",
    width: 32,
    marginEnd: 8,
  },
  timelineLine: {
    width: 2,
    flex: 1,
    marginVertical: 4,
  },
  timelineContent: {
    flex: 1,
    paddingBottom: 20,
  },
});
