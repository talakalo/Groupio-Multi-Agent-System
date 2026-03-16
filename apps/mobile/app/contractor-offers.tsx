import React, { useCallback, useState } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  Pressable,
} from "react-native";
import {
  Text,
  Card,
  Chip,
  Badge,
  useTheme,
  Searchbar,
  SegmentedButtons,
  ActivityIndicator,
} from "react-native-paper";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import type { Offer, OfferStatus, ServiceCategory } from "@groupio/types";

import { useContractorOffers } from "../lib/hooks";
import i18n from "../lib/i18n";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_FILTERS: { value: OfferStatus | "all"; labelKey: string }[] = [
  { value: "all", labelKey: "contractor.statusAll" },
  { value: "active", labelKey: "contractor.statusActive" },
  { value: "in_progress", labelKey: "contractor.statusInProgress" },
  { value: "completed", labelKey: "contractor.statusCompleted" },
];

const STATUS_CONFIG: Record<
  OfferStatus,
  { labelKey: string; color: string; bg: string; icon: string }
> = {
  draft: { labelKey: "contractor.statusDraft", color: "#757575", bg: "#F5F5F5", icon: "pencil-outline" },
  active: { labelKey: "contractor.statusActive", color: "#2E7D32", bg: "#E8F5E9", icon: "check-circle-outline" },
  pending: { labelKey: "contractor.statusPending", color: "#F57F17", bg: "#FFF9C4", icon: "clock-outline" },
  in_progress: { labelKey: "contractor.statusInProgress", color: "#1565C0", bg: "#E3F2FD", icon: "progress-wrench" },
  completed: { labelKey: "contractor.statusCompleted", color: "#1a9a76", bg: "#d1f0e6", icon: "check-all" },
  cancelled: { labelKey: "contractor.statusCancelled", color: "#D32F2F", bg: "#FFCDD2", icon: "close-circle-outline" },
  expired: { labelKey: "contractor.statusExpired", color: "#9E9E9E", bg: "#EEEEEE", icon: "timer-off-outline" },
};

const CATEGORY_KEYS: Record<ServiceCategory, string> = {
  ac_installation: "category.ac_installation",
  ac_maintenance: "category.ac_maintenance",
  kitchen: "category.kitchen",
  electrical: "category.electrical",
  plumbing: "category.plumbing",
  heating: "category.heating",
  renovations: "category.renovations",
  painting: "category.painting",
  flooring: "category.flooring",
  windows: "category.windows",
  security: "category.security",
};

// ---------------------------------------------------------------------------
// Offer Row Component
// ---------------------------------------------------------------------------

interface OfferRowProps {
  offer: Offer;
  onPress: (offer: Offer) => void;
}

function OfferRow({ offer, onPress }: OfferRowProps) {
  const theme = useTheme();
  const status = STATUS_CONFIG[offer.status];
  const currentTier = offer.tiers[offer.currentTier] ?? offer.tiers[0];
  const earnings = currentTier
    ? currentTier.price * offer.participants
    : offer.basePrice * offer.participants;

  return (
    <Card
      style={[styles.offerCard, { backgroundColor: theme.colors.surface }]}
      mode="elevated"
      onPress={() => onPress(offer)}
    >
      <Card.Content style={styles.offerContent}>
        <View style={styles.offerHeader}>
          <View style={styles.offerTitleRow}>
            <Text
              variant="titleSmall"
              style={[styles.offerTitle, { color: theme.colors.onSurface }]}
              numberOfLines={1}
            >
              {i18n.t(CATEGORY_KEYS[offer.category])}
            </Text>
            <Chip
              style={[styles.statusChip, { backgroundColor: status.bg }]}
              textStyle={[styles.statusChipText, { color: status.color }]}
              compact
              icon={() => (
                <Icon name={status.icon} size={14} color={status.color} />
              )}
            >
              {i18n.t(status.labelKey)}
            </Chip>
          </View>
        </View>

        <View style={styles.offerMeta}>
          <View style={styles.metaItem}>
            <Icon
              name="account-group"
              size={16}
              color={theme.colors.onSurfaceVariant}
            />
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {offer.participants} {i18n.t("contractor.participants")}
            </Text>
          </View>

          <View style={styles.metaItem}>
            <Icon
              name="currency-ils"
              size={16}
              color={theme.colors.onSurfaceVariant}
            />
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              ₪{earnings.toLocaleString()}
            </Text>
          </View>

          <View style={styles.metaItem}>
            <Icon
              name="calendar-outline"
              size={16}
              color={theme.colors.onSurfaceVariant}
            />
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {new Date(offer.createdAt).toLocaleDateString("he-IL")}
            </Text>
          </View>
        </View>

        {offer.participants > 0 && (
          <View style={styles.participantBadge}>
            <Badge
              size={22}
              style={{ backgroundColor: theme.colors.primary }}
            >
              {offer.participants}
            </Badge>
          </View>
        )}
      </Card.Content>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ContractorOffersScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [statusFilter, setStatusFilter] = useState<OfferStatus | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const filters =
    statusFilter === "all" ? undefined : { status: statusFilter };

  const {
    data: offersData,
    isLoading,
    refetch,
    isRefetching,
  } = useContractorOffers(filters);

  const offers = offersData?.data ?? [];

  const filteredOffers = searchQuery
    ? offers.filter((o) =>
        i18n.t(CATEGORY_KEYS[o.category])
          .toLowerCase()
          .includes(searchQuery.toLowerCase()),
      )
    : offers;

  const handleOfferPress = useCallback(
    (offer: Offer) => {
      router.push(`/offer-detail?id=${offer.id}` as never);
    },
    [router],
  );

  const handleCreateOffer = useCallback(() => {
    router.push("/create-offer" as never);
  }, [router]);

  const renderOffer = useCallback(
    ({ item }: { item: Offer }) => (
      <OfferRow offer={item} onPress={handleOfferPress} />
    ),
    [handleOfferPress],
  );

  return (
    <SafeAreaView
      edges={["top"]}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.outlineVariant,
          },
        ]}
      >
        <View style={styles.headerRow}>
          <Pressable
            onPress={() => router.back()}
            style={styles.backButton}
          >
            <Icon name="arrow-right" size={24} color={theme.colors.onSurface} />
          </Pressable>
          <Text
            variant="titleLarge"
            style={[styles.headerTitle, { color: theme.colors.onSurface }]}
          >
            {i18n.t("contractor.myOffers")}
          </Text>
          <Pressable onPress={handleCreateOffer} style={styles.addButton}>
            <Icon name="plus" size={24} color={theme.colors.primary} />
          </Pressable>
        </View>

        <Searchbar
          placeholder={i18n.t("contractor.searchOffers")}
          value={searchQuery}
          onChangeText={setSearchQuery}
          style={[
            styles.searchBar,
            { backgroundColor: theme.colors.surfaceVariant },
          ]}
          inputStyle={styles.searchInput}
          elevation={0}
        />

        <View style={styles.filterRow}>
          <SegmentedButtons
            value={statusFilter}
            onValueChange={(val) => setStatusFilter(val as OfferStatus | "all")}
            buttons={STATUS_FILTERS.map((f) => ({
              value: f.value,
              label: i18n.t(f.labelKey),
              style: styles.segmentButton,
            }))}
            density="small"
            style={styles.segmentedButtons}
          />
        </View>
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      ) : (
        <FlatList
          data={filteredOffers}
          renderItem={renderOffer}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Icon
                name="tag-off-outline"
                size={56}
                color={theme.colors.outlineVariant}
              />
              <Text
                variant="bodyLarge"
                style={{
                  color: theme.colors.onSurfaceVariant,
                  marginTop: 12,
                }}
              >
                {i18n.t("contractor.noOffers")}
              </Text>
              <Text
                variant="bodySmall"
                style={{
                  color: theme.colors.onSurfaceVariant,
                  textAlign: "center",
                  marginTop: 4,
                }}
              >
                {i18n.t("contractor.createNewToStart")}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backButton: {
    padding: 4,
  },
  headerTitle: {
    fontWeight: "800",
    fontSize: 20,
  },
  addButton: {
    padding: 4,
  },
  searchBar: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    height: 44,
  },
  searchInput: {
    fontSize: 14,
  },
  filterRow: {
    paddingHorizontal: 16,
  },
  segmentedButtons: {
    borderRadius: 12,
  },
  segmentButton: {
    borderRadius: 12,
  },
  listContent: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  // Offer card
  offerCard: {
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 14,
    elevation: 1,
  },
  offerContent: {
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  offerHeader: {
    marginBottom: 10,
  },
  offerTitleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  offerTitle: {
    fontWeight: "700",
    fontSize: 15,
    flex: 1,
    marginEnd: 8,
  },
  statusChip: {
    height: 26,
    borderRadius: 8,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  offerMeta: {
    flexDirection: "row",
    gap: 16,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  participantBadge: {
    position: "absolute",
    top: 8,
    end: 8,
  },

  // Empty
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
});
