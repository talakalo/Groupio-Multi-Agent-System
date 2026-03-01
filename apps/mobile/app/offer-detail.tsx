import React, { useCallback, useState } from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import {
  Text,
  Button,
  Chip,
  Avatar,
  Divider,
  ProgressBar,
  useTheme,
  Snackbar,
  IconButton,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import type { ServiceCategory } from "@groupio/types";

import { useOffer, useJoinOffer } from "../lib/hooks";

const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  ac_installation: "\u05D4\u05EA\u05E7\u05E0\u05EA \u05DE\u05D6\u05D2\u05E0\u05D9\u05DD",
  ac_maintenance: "\u05EA\u05D7\u05D6\u05D5\u05E7\u05EA \u05DE\u05D6\u05D2\u05E0\u05D9\u05DD",
  kitchen: "\u05DE\u05D8\u05D1\u05D7\u05D9\u05DD",
  electrical: "\u05D7\u05E9\u05DE\u05DC",
  plumbing: "\u05D0\u05D9\u05E0\u05E1\u05D8\u05DC\u05E6\u05D9\u05D4",
  heating: "\u05D7\u05D9\u05DE\u05D5\u05DD",
  renovations: "\u05E9\u05D9\u05E4\u05D5\u05E6\u05D9\u05DD",
  painting: "\u05E6\u05D1\u05D9\u05E2\u05D4",
  flooring: "\u05E8\u05D9\u05E6\u05D5\u05E3",
  windows: "\u05D7\u05DC\u05D5\u05E0\u05D5\u05EA",
  security: "\u05D0\u05D1\u05D8\u05D7\u05D4",
};

export default function OfferDetailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const { data: offer, isLoading, isError } = useOffer(id ?? "", {
    enabled: !!id,
  });

  const joinMutation = useJoinOffer({
    onSuccess: () => setSnackbar("\u05D4\u05E6\u05D8\u05E8\u05E4\u05EA \u05DC\u05D4\u05E6\u05E2\u05D4 \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4!"),
    onError: () => setSnackbar("\u05DC\u05D0 \u05D4\u05E6\u05DC\u05D7\u05E0\u05D5 \u05DC\u05D4\u05E6\u05D8\u05E8\u05E3. \u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1."),
  });

  const handleJoin = useCallback(() => {
    if (offer) joinMutation.mutate(offer.id);
  }, [offer, joinMutation]);

  if (isLoading) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
          {"\u05D8\u05D5\u05E2\u05DF..."}
        </Text>
      </SafeAreaView>
    );
  }

  if (isError || !offer) {
    return (
      <SafeAreaView style={[styles.center, { backgroundColor: theme.colors.background }]}>
        <Icon name="alert-circle-outline" size={48} color={theme.colors.error} />
        <Text variant="titleMedium" style={{ color: theme.colors.onSurface, marginTop: 12 }}>
          {"\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D4 \u05D4\u05E6\u05E2\u05D4"}
        </Text>
        <Button mode="text" onPress={() => router.back()} style={{ marginTop: 16 }}>
          {"\u05D7\u05D6\u05D5\u05E8"}
        </Button>
      </SafeAreaView>
    );
  }

  const currentTier = offer.tiers[offer.currentTier] ?? offer.tiers[0];
  const currentPrice = currentTier ? currentTier.price : offer.basePrice;
  const discountPercent = currentTier ? currentTier.discount : 0;
  const nextTier = offer.tiers[offer.currentTier + 1];
  const isExpired = new Date(offer.expiresAt) < new Date();
  const isActive = offer.status === "active" && !isExpired;

  const progressToNextTier = nextTier
    ? (offer.participants - (currentTier?.min ?? 0)) /
      ((nextTier.min ?? 0) - (currentTier?.min ?? 0))
    : 1;

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.colors.outlineVariant }]}>
        <IconButton icon="arrow-right" onPress={() => router.back()} />
        <Text variant="titleLarge" style={[styles.headerTitle, { color: theme.colors.onSurface }]}>
          {"\u05E4\u05E8\u05D8\u05D9 \u05D4\u05E6\u05E2\u05D4"}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Contractor info */}
        <View style={styles.contractorSection}>
          <Avatar.Text
            size={56}
            label={(offer.contractor?.businessName ?? "??").substring(0, 2)}
            style={{ backgroundColor: theme.colors.primaryContainer }}
            labelStyle={{ color: theme.colors.onPrimaryContainer }}
          />
          <View style={styles.contractorInfo}>
            <Text variant="titleLarge" style={{ color: theme.colors.onSurface, fontWeight: "700" }}>
              {offer.contractor?.businessName ?? ""}
            </Text>
            <View style={styles.ratingRow}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Icon
                  key={i}
                  name={i < Math.floor(offer.contractor?.rating ?? 0) ? "star" : "star-outline"}
                  size={18}
                  color="#FFC107"
                />
              ))}
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginStart: 4 }}>
                {(offer.contractor?.rating ?? 0).toFixed(1)}
              </Text>
            </View>
          </View>
        </View>

        {/* Category badge */}
        <View style={styles.categoryRow}>
          <Chip compact style={{ backgroundColor: theme.colors.primaryContainer }}>
            {CATEGORY_LABELS[offer.category]}
          </Chip>
          <Chip
            compact
            style={{
              backgroundColor: isActive
                ? theme.colors.tertiaryContainer
                : theme.colors.errorContainer,
            }}
            textStyle={{
              color: isActive ? theme.colors.tertiary : theme.colors.error,
            }}
          >
            {isActive ? "\u05E4\u05E2\u05D9\u05DC" : isExpired ? "\u05E4\u05D2 \u05EA\u05D5\u05E7\u05E3" : offer.status}
          </Chip>
        </View>

        <Divider style={styles.divider} />

        {/* Pricing */}
        <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
          {"\u05DE\u05D7\u05D9\u05E8\u05D9\u05DD"}
        </Text>
        <View style={[styles.priceCard, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.priceRow}>
            <View>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {"\u05DE\u05D7\u05D9\u05E8 \u05DE\u05E7\u05D5\u05E8\u05D9"}
              </Text>
              <Text
                variant="bodyLarge"
                style={{ color: theme.colors.onSurfaceVariant, textDecorationLine: "line-through" }}
              >
                {"\u20AA"}{offer.basePrice.toLocaleString()}
              </Text>
            </View>
            <View style={styles.currentPriceCol}>
              {discountPercent > 0 && (
                <View style={[styles.discountBadge, { backgroundColor: theme.colors.tertiaryContainer }]}>
                  <Text variant="labelSmall" style={{ color: theme.colors.tertiary, fontWeight: "800" }}>
                    -{discountPercent}%
                  </Text>
                </View>
              )}
              <Text variant="headlineMedium" style={{ color: theme.colors.primary, fontWeight: "800" }}>
                {"\u20AA"}{currentPrice.toLocaleString()}
              </Text>
            </View>
          </View>
        </View>

        {/* Pricing tiers */}
        <Text variant="titleSmall" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
          {"\u05DE\u05D3\u05E8\u05D2\u05D5\u05EA \u05DE\u05D7\u05D9\u05E8"}
        </Text>
        {offer.tiers.map((tier, idx) => (
          <View
            key={idx}
            style={[
              styles.tierItem,
              {
                backgroundColor:
                  idx === offer.currentTier
                    ? theme.colors.primaryContainer
                    : theme.colors.surfaceVariant,
                borderColor:
                  idx === offer.currentTier
                    ? theme.colors.primary
                    : theme.colors.outlineVariant,
              },
            ]}
          >
            <View style={styles.tierLeft}>
              <Icon
                name={idx === offer.currentTier ? "check-circle" : "circle-outline"}
                size={20}
                color={idx === offer.currentTier ? theme.colors.primary : theme.colors.outlineVariant}
              />
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>
                {tier.min}{tier.max ? `-${tier.max}` : "+"} {"\u05DE\u05E9\u05EA\u05EA\u05E4\u05D9\u05DD"}
              </Text>
            </View>
            <View style={styles.tierRight}>
              {tier.discount > 0 && (
                <Text variant="bodySmall" style={{ color: theme.colors.tertiary, fontWeight: "700" }}>
                  -{tier.discount}%
                </Text>
              )}
              <Text variant="titleSmall" style={{ color: theme.colors.primary, fontWeight: "700" }}>
                {"\u20AA"}{tier.price.toLocaleString()}
              </Text>
            </View>
          </View>
        ))}

        <Divider style={styles.divider} />

        {/* Participants progress */}
        <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>
          {"\u05DE\u05E9\u05EA\u05EA\u05E4\u05D9\u05DD"}
        </Text>
        <View style={styles.participantsRow}>
          <Icon name="account-group" size={24} color={theme.colors.primary} />
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, fontWeight: "700", marginStart: 8 }}>
            {offer.participants}
          </Text>
          {nextTier && (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginStart: 8 }}>
              ({"\u05E2\u05D5\u05D3"} {nextTier.min - offer.participants} {"\u05DC\u05D4\u05E0\u05D7\u05D4 \u05D4\u05D1\u05D0\u05D4"})
            </Text>
          )}
        </View>
        <ProgressBar
          progress={Math.min(progressToNextTier, 1)}
          color={theme.colors.primary}
          style={[styles.progressBar, { backgroundColor: theme.colors.surfaceVariant }]}
        />

        {/* Expiry info */}
        <View style={[styles.infoRow, { marginTop: 16 }]}>
          <Icon name="clock-outline" size={18} color={theme.colors.onSurfaceVariant} />
          <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginStart: 8 }}>
            {"\u05EA\u05D5\u05E7\u05E3:"}{" "}
            {new Date(offer.expiresAt).toLocaleDateString("he-IL", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </Text>
        </View>

        {/* Join button */}
        <Button
          mode="contained"
          onPress={handleJoin}
          disabled={!isActive || joinMutation.isPending}
          loading={joinMutation.isPending}
          style={styles.joinButton}
          contentStyle={styles.joinButtonContent}
          labelStyle={styles.joinButtonLabel}
          icon="account-plus"
        >
          {isActive
            ? "\u05D4\u05E6\u05D8\u05E8\u05E3 \u05DC\u05D4\u05E6\u05E2\u05D4"
            : isExpired
              ? "\u05E4\u05D2 \u05EA\u05D5\u05E7\u05E3"
              : "\u05DC\u05D0 \u05D6\u05DE\u05D9\u05DF"}
        </Button>
      </ScrollView>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar(null)}
        duration={3000}
        action={{ label: "\u05E1\u05D2\u05D5\u05E8", onPress: () => setSnackbar(null) }}
      >
        {snackbar ?? ""}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { flex: 1, fontWeight: "700", textAlign: "center" },
  headerSpacer: { width: 48 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  contractorSection: { flexDirection: "row", alignItems: "center", marginBottom: 16 },
  contractorInfo: { marginStart: 16, flex: 1 },
  ratingRow: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  categoryRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  divider: { marginVertical: 16 },
  sectionTitle: { fontWeight: "700", marginBottom: 12 },
  priceCard: { borderRadius: 12, padding: 16, elevation: 1, marginBottom: 16 },
  priceRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  currentPriceCol: { alignItems: "flex-end" },
  discountBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, marginBottom: 4 },
  tierItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 8,
  },
  tierLeft: { flexDirection: "row", alignItems: "center", gap: 8 },
  tierRight: { flexDirection: "row", alignItems: "center", gap: 8 },
  participantsRow: { flexDirection: "row", alignItems: "center" },
  progressBar: { height: 8, borderRadius: 4, marginTop: 8 },
  infoRow: { flexDirection: "row", alignItems: "center" },
  joinButton: { marginTop: 24, borderRadius: 12, elevation: 0 },
  joinButtonContent: { height: 48 },
  joinButtonLabel: { fontSize: 16, fontWeight: "700" },
});
