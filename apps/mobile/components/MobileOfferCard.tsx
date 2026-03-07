import React from "react";
import { StyleSheet, View } from "react-native";
import {
  Card,
  Text,
  Button,
  Chip,
  Avatar,
  useTheme,
  ProgressBar,
} from "react-native-paper";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import type { Offer, ServiceCategory } from "@groupio/types";

// Hebrew labels for service categories
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

// Category colors for badge backgrounds
const CATEGORY_COLORS: Record<ServiceCategory, string> = {
  ac_installation: "#E3F2FD",
  ac_maintenance: "#E1F5FE",
  kitchen: "#FFF3E0",
  electrical: "#FFF9C4",
  plumbing: "#E0F2F1",
  heating: "#FCE4EC",
  renovations: "#F3E5F5",
  painting: "#E8F5E9",
  flooring: "#EFEBE9",
  windows: "#E0F7FA",
  security: "#E8EAF6",
};

interface MobileOfferCardProps {
  offer: Offer;
  onJoin?: (offerId: string) => void;
  onPress?: (offer: Offer) => void;
}

function RatingStars({ rating }: { rating: number }) {
  const theme = useTheme();
  const fullStars = Math.floor(rating);
  const hasHalfStar = rating - fullStars >= 0.5;
  const emptyStars = 5 - fullStars - (hasHalfStar ? 1 : 0);

  return (
    <View style={styles.ratingContainer}>
      {Array.from({ length: fullStars }).map((_, i) => (
        <Icon key={`full-${i}`} name="star" size={16} color="#FFC107" />
      ))}
      {hasHalfStar && <Icon name="star-half-full" size={16} color="#FFC107" />}
      {Array.from({ length: emptyStars }).map((_, i) => (
        <Icon
          key={`empty-${i}`}
          name="star-outline"
          size={16}
          color={theme.colors.outlineVariant}
        />
      ))}
      <Text variant="bodySmall" style={styles.ratingText}>
        {rating.toFixed(1)}
      </Text>
    </View>
  );
}

export function MobileOfferCard({ offer, onJoin, onPress }: MobileOfferCardProps) {
  const theme = useTheme();

  const currentTier = offer.tiers[offer.currentTier] ?? offer.tiers[0];
  const discountPercent = currentTier ? currentTier.discount : 0;
  const currentPrice = currentTier ? currentTier.price : offer.basePrice;
  const nextTier = offer.tiers[offer.currentTier + 1];

  // Calculate progress to next tier
  const progressToNextTier = nextTier
    ? (offer.participants - (currentTier?.min ?? 0)) /
      ((nextTier.min ?? 0) - (currentTier?.min ?? 0))
    : 1;

  const isExpired = new Date(offer.expiresAt) < new Date();
  const isActive = offer.status === "active" && !isExpired;

  const handleJoin = () => {
    if (onJoin && isActive) {
      onJoin(offer.id);
    }
  };

  const handlePress = () => {
    if (onPress) {
      onPress(offer);
    }
  };

  return (
    <Card
      style={[styles.card, { backgroundColor: theme.colors.surface }]}
      mode="elevated"
      onPress={handlePress}
      testID="offer-card"
    >
      <Card.Content style={styles.cardContent}>
        {/* Header: Contractor info + Category badge */}
        <View style={styles.header}>
          <View style={styles.contractorInfo}>
            <Avatar.Text
              size={44}
              label={(offer.contractor?.businessName ?? "??").substring(0, 2)}
              style={{ backgroundColor: theme.colors.primaryContainer }}
              labelStyle={{ color: theme.colors.onPrimaryContainer }}
            />
            <View style={styles.contractorDetails}>
              <Text
                variant="titleMedium"
                style={[styles.contractorName, { color: theme.colors.onSurface }]}
                numberOfLines={1}
              >
                {offer.contractor?.businessName ?? ""}
              </Text>
              <RatingStars rating={offer.contractor?.rating ?? 0} />
            </View>
          </View>
          <Chip
            style={[
              styles.categoryBadge,
              { backgroundColor: CATEGORY_COLORS[offer.category] },
            ]}
            textStyle={styles.categoryBadgeText}
            compact
          >
            {CATEGORY_LABELS[offer.category]}
          </Chip>
        </View>

        {/* Pricing section */}
        <View style={styles.pricingSection}>
          <View style={styles.priceRow}>
            <View style={styles.priceInfo}>
              <Text
                variant="bodySmall"
                style={[styles.originalPriceLabel, { color: theme.colors.onSurfaceVariant }]}
              >
                {"\u05DE\u05D7\u05D9\u05E8 \u05DE\u05E7\u05D5\u05E8\u05D9"}
              </Text>
              <Text
                variant="bodySmall"
                style={[styles.originalPrice, { color: theme.colors.onSurfaceVariant }]}
              >
                {"\u20AA"}{offer.basePrice.toLocaleString()}
              </Text>
            </View>
            <View style={styles.currentPriceContainer}>
              {discountPercent > 0 && (
                <View
                  style={[
                    styles.discountBadge,
                    { backgroundColor: theme.colors.tertiaryContainer },
                  ]}
                >
                  <Text
                    variant="labelSmall"
                    style={[styles.discountText, { color: theme.colors.tertiary }]}
                  >
                    -{discountPercent}%
                  </Text>
                </View>
              )}
              <Text
                variant="headlineSmall"
                style={[styles.currentPrice, { color: theme.colors.primary }]}
              >
                {"\u20AA"}{currentPrice.toLocaleString()}
              </Text>
            </View>
          </View>
        </View>

        {/* Participants progress */}
        <View style={styles.participantsSection}>
          <View style={styles.participantsRow}>
            <View style={styles.participantsInfo}>
              <Icon name="account-group" size={18} color={theme.colors.primary} />
              <Text
                variant="bodySmall"
                style={[styles.participantsText, { color: theme.colors.onSurfaceVariant }]}
              >
                {offer.participants} {"\u05DE\u05E9\u05EA\u05EA\u05E4\u05D9\u05DD"}
              </Text>
            </View>
            {nextTier && (
              <Text
                variant="bodySmall"
                style={[styles.nextTierText, { color: theme.colors.tertiary }]}
              >
                {"\u05E2\u05D5\u05D3"} {nextTier.min - offer.participants} {"\u05DC\u05D4\u05E0\u05D7\u05D4 \u05E0\u05D5\u05E1\u05E4\u05EA"}!
              </Text>
            )}
          </View>
          <ProgressBar
            progress={Math.min(progressToNextTier, 1)}
            color={theme.colors.primary}
            style={[styles.progressBar, { backgroundColor: theme.colors.surfaceVariant }]}
          />
        </View>

        {/* Join button */}
        <Button
          mode="contained"
          onPress={handleJoin}
          disabled={!isActive}
          style={styles.joinButton}
          labelStyle={styles.joinButtonLabel}
          icon="account-plus"
          contentStyle={styles.joinButtonContent}
          testID="join-button"
        >
          {isActive
            ? "\u05D4\u05E6\u05D8\u05E8\u05E3 \u05DC\u05D4\u05E6\u05E2\u05D4"
            : isExpired
              ? "\u05E4\u05D2 \u05EA\u05D5\u05E7\u05E3"
              : "\u05DC\u05D0 \u05D6\u05DE\u05D9\u05DF"}
        </Button>
      </Card.Content>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    marginHorizontal: 16,
    marginVertical: 6,
    elevation: 2,
  },
  cardContent: {
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 14,
  },
  contractorInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    marginEnd: 8,
  },
  contractorDetails: {
    marginStart: 12,
    flex: 1,
  },
  contractorName: {
    fontWeight: "700",
    fontSize: 16,
    marginBottom: 2,
  },
  ratingContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  ratingText: {
    marginStart: 4,
    fontSize: 12,
    fontWeight: "600",
    color: "#757575",
  },
  categoryBadge: {
    borderRadius: 12,
    height: 28,
  },
  categoryBadgeText: {
    fontSize: 11,
    fontWeight: "600",
  },
  pricingSection: {
    marginBottom: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E0E0E0",
  },
  priceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  priceInfo: {
    flexDirection: "column",
  },
  originalPriceLabel: {
    fontSize: 11,
    marginBottom: 2,
  },
  originalPrice: {
    textDecorationLine: "line-through",
    fontSize: 14,
  },
  currentPriceContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  discountBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  discountText: {
    fontWeight: "800",
    fontSize: 13,
  },
  currentPrice: {
    fontWeight: "800",
    fontSize: 24,
  },
  participantsSection: {
    marginBottom: 14,
  },
  participantsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  participantsInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  participantsText: {
    fontSize: 13,
    fontWeight: "500",
  },
  nextTierText: {
    fontSize: 12,
    fontWeight: "600",
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
  },
  joinButton: {
    borderRadius: 12,
    elevation: 0,
  },
  joinButtonLabel: {
    fontSize: 15,
    fontWeight: "700",
    paddingVertical: 2,
  },
  joinButtonContent: {
    height: 44,
  },
});

export default MobileOfferCard;
