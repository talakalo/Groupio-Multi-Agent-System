import React, { useState, useCallback } from "react";
import { View, ScrollView, StyleSheet } from "react-native";
import {
  Text,
  Button,
  Divider,
  useTheme,
  ActivityIndicator,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

import { useOffer } from "../lib/hooks";
import { createCheckout } from "../lib/api";
import i18n from "../lib/i18n";

type CheckoutState = "review" | "processing" | "success" | "error";

export default function CheckoutScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { offerId, tierId } = useLocalSearchParams<{
    offerId: string;
    tierId: string;
  }>();

  const { data: offer, isLoading } = useOffer(offerId ?? "", {
    enabled: !!offerId,
  });

  const [state, setState] = useState<CheckoutState>("review");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const tierIndex = parseInt(tierId ?? "0", 10);
  const tier = offer?.tiers[tierIndex] ?? offer?.tiers[offer.currentTier];
  const price = tier?.price ?? offer?.basePrice ?? 0;
  const discount = tier?.discount ?? 0;
  const originalPrice = offer?.basePrice ?? 0;

  const handleCheckout = useCallback(async () => {
    if (!offerId) return;
    setState("processing");
    setErrorMessage(null);
    try {
      await createCheckout({ offerId, tierId: tierIndex });
      setState("success");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : i18n.t("checkout.paymentFailed");
      setErrorMessage(message);
      setState("error");
    }
  }, [offerId, tierIndex]);

  if (isLoading) {
    return (
      <SafeAreaView
        style={[styles.center, { backgroundColor: theme.colors.background }]}
      >
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  if (state === "success") {
    return (
      <SafeAreaView
        style={[styles.center, { backgroundColor: theme.colors.background }]}
      >
        <View
          style={[
            styles.iconCircle,
            { backgroundColor: theme.colors.tertiaryContainer },
          ]}
        >
          <Icon name="check-circle" size={56} color={theme.colors.tertiary} />
        </View>
        <Text
          variant="headlineSmall"
          style={[styles.successTitle, { color: theme.colors.onSurface }]}
        >
          {i18n.t("checkout.orderSuccess")}
        </Text>
        <Text
          variant="bodyLarge"
          style={{ color: theme.colors.onSurfaceVariant, textAlign: "center" }}
        >
          {i18n.t("checkout.orderProcessing")}
        </Text>
        <Button
          mode="contained"
          onPress={() => router.replace("/(tabs)")}
          style={styles.homeButton}
          icon="home"
        >
          {i18n.t("checkout.backToHome")}
        </Button>
        <Button
          mode="text"
          onPress={() =>
            router.replace({ pathname: "/(tabs)/orders" as never })
          }
        >
          {i18n.t("checkout.viewMyOrders")}
        </Button>
      </SafeAreaView>
    );
  }

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
        <Button
          mode="text"
          compact
          icon="arrow-right"
          onPress={() => router.back()}
        >
          {i18n.t("common.back")}
        </Button>
        <Text
          variant="titleLarge"
          style={{ fontWeight: "700", color: theme.colors.onSurface }}
        >
          {i18n.t("checkout.title")}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Order review */}
        <View
          style={[
            styles.section,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          <Text
            variant="titleMedium"
            style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
          >
            {i18n.t("checkout.orderSummary")}
          </Text>
          <Text
            variant="bodyLarge"
            style={{ color: theme.colors.onSurface, fontWeight: "600" }}
          >
            {offer?.contractor?.businessName ?? i18n.t("checkout.groupOffer")}
          </Text>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}
          >
            {tier
              ? `${tier.min}${tier.max ? `-${tier.max}` : "+"} ${i18n.t("checkout.participants")}`
              : ""}
          </Text>
        </View>

        {/* Trust badges */}
        <View style={styles.trustRow}>
          <View style={styles.trustBadge}>
            <Icon
              name="shield-check"
              size={22}
              color={theme.colors.tertiary}
            />
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurface, marginStart: 6 }}
            >
            {i18n.t("checkout.verifiedContractor")}
          </Text>
          </View>
          <View style={styles.trustBadge}>
            <Icon name="lock" size={22} color={theme.colors.tertiary} />
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurface, marginStart: 6 }}
            >
              {i18n.t("checkout.securePayment")}
            </Text>
          </View>
          <View style={styles.trustBadge}>
            <Icon
              name="cash-lock"
              size={22}
              color={theme.colors.tertiary}
            />
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurface, marginStart: 6 }}
            >
              {i18n.t("checkout.escrowProtection")}
            </Text>
          </View>
        </View>

        {/* Price breakdown */}
        <View
          style={[
            styles.section,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          <Text
            variant="titleMedium"
            style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
          >
            {i18n.t("checkout.priceBreakdown")}
          </Text>
          <View style={styles.priceRow}>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>
              {i18n.t("checkout.originalPrice")}
            </Text>
            <Text style={{ color: theme.colors.onSurfaceVariant }}>
              ₪{originalPrice.toLocaleString()}
            </Text>
          </View>
          {discount > 0 && (
            <View style={styles.priceRow}>
              <Text style={{ color: theme.colors.tertiary }}>
                {i18n.t("checkout.groupDiscount")} ({discount}%)
              </Text>
              <Text style={{ color: theme.colors.tertiary, fontWeight: "700" }}>
                -₪{(originalPrice - price).toLocaleString()}
              </Text>
            </View>
          )}
          <Divider style={styles.priceDivider} />
          <View style={styles.priceRow}>
            <Text
              variant="titleMedium"
              style={{ color: theme.colors.onSurface, fontWeight: "800" }}
            >
              {i18n.t("checkout.total")}
            </Text>
            <Text
              variant="titleMedium"
              style={{ color: theme.colors.primary, fontWeight: "800" }}
            >
              ₪{price.toLocaleString()}
            </Text>
          </View>
        </View>

        {state === "error" && errorMessage && (
          <View
            style={[
              styles.errorBanner,
              { backgroundColor: theme.colors.errorContainer },
            ]}
          >
            <Icon name="alert-circle" size={18} color={theme.colors.error} />
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.error, flex: 1, marginStart: 8 }}
            >
              {errorMessage}
            </Text>
          </View>
        )}

        <Button
          mode="contained"
          onPress={handleCheckout}
          loading={state === "processing"}
          disabled={state === "processing"}
          style={styles.payButton}
          contentStyle={styles.payContent}
          labelStyle={styles.payLabel}
          icon="credit-card-check"
        >
          {i18n.t("checkout.proceedToPayment")}
        </Button>

        <View style={styles.secureNote}>
          <Icon name="lock" size={14} color={theme.colors.onSurfaceVariant} />
          <Text
            variant="bodySmall"
            style={{
              color: theme.colors.onSurfaceVariant,
              marginStart: 6,
            }}
          >
            {i18n.t("checkout.paymentSecure")}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
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
  section: {
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    elevation: 1,
  },
  sectionTitle: {
    fontWeight: "700",
    marginBottom: 12,
  },
  trustRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 16,
  },
  trustBadge: {
    flexDirection: "row",
    alignItems: "center",
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  priceDivider: { marginVertical: 8 },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
  },
  payButton: {
    borderRadius: 12,
    marginTop: 8,
  },
  payContent: { height: 52 },
  payLabel: { fontSize: 16, fontWeight: "700" },
  secureNote: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
  },
  iconCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  successTitle: { fontWeight: "800", textAlign: "center", marginBottom: 8 },
  homeButton: { borderRadius: 12, marginTop: 32, alignSelf: "stretch" },
});
