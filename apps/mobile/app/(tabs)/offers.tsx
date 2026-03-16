import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  Pressable,
  I18nManager,
} from "react-native";
import {
  Text,
  FAB,
  SegmentedButtons,
  useTheme,
  Portal,
  Modal,
  Button,
  TextInput,
  Snackbar,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import type { Offer, OfferStatus, ServiceCategory } from "@groupio/types";

import { MobileOfferCard } from "../../components/MobileOfferCard";
import { CategoryChip } from "../../components/CategoryChip";
import { useOffers, useJoinOffer, useProfile } from "../../lib/hooks";
import i18n from "../../lib/i18n";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type TabKey = "my" | "available" | "completed";

const TABS: { value: TabKey; labelKey: string }[] = [
  { value: "my", labelKey: "offers.myOffers" },
  { value: "available", labelKey: "offers.available" },
  { value: "completed", labelKey: "offers.completed" },
];

const ALL_CATEGORIES: (ServiceCategory | "all")[] = [
  "all",
  "ac_installation",
  "ac_maintenance",
  "kitchen",
  "electrical",
  "plumbing",
  "heating",
  "renovations",
  "painting",
  "flooring",
  "windows",
];

function tabToStatus(tab: TabKey): OfferStatus | undefined {
  switch (tab) {
    case "my":
      return "active"; // server filters by user ownership
    case "available":
      return "active";
    case "completed":
      return "completed";
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OffersScreen() {
  const theme = useTheme();
  const router = useRouter();

  // Local state
  const [activeTab, setActiveTab] = useState<TabKey>("available");
  const [selectedCategory, setSelectedCategory] = useState<
    ServiceCategory | "all"
  >("all");
  const [joinSnackbar, setJoinSnackbar] = useState<string | null>(null);

  // Data
  const { data: profile } = useProfile();
  const buildingId = profile?.buildingId ?? "";

  const filters = useMemo(
    () => ({
      status: tabToStatus(activeTab),
      buildingId: buildingId || undefined,
      category:
        selectedCategory !== "all" ? selectedCategory : undefined,
      limit: 20,
    }),
    [activeTab, buildingId, selectedCategory],
  );

  const {
    data: offersData,
    isLoading,
    isFetching,
    refetch,
  } = useOffers(filters, { enabled: !!buildingId });

  const joinMutation = useJoinOffer({
    onSuccess: () => {
      setJoinSnackbar(i18n.t("offers.joinSuccess"));
    },
    onError: () => {
      setJoinSnackbar(i18n.t("offers.joinError"));
    },
  });

  const offers = offersData?.data ?? [];

  // Handlers
  const handleJoin = useCallback(
    (offerId: string) => {
      joinMutation.mutate(offerId);
    },
    [joinMutation],
  );

  const handleOfferPress = useCallback((offer: Offer) => {
    router.push({ pathname: "/offer-detail", params: { id: offer.id } });
  }, [router]);

  const handleCategoryPress = useCallback(
    (cat: ServiceCategory | "all") => {
      setSelectedCategory(cat);
    },
    [],
  );

  const onRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  // Render helpers
  const renderOffer = useCallback(
    ({ item }: { item: Offer }) => (
      <MobileOfferCard
        offer={item}
        onJoin={handleJoin}
        onPress={handleOfferPress}
      />
    ),
    [handleJoin, handleOfferPress],
  );

  const keyExtractor = useCallback((item: Offer) => item.id, []);

  const ListHeaderComponent = useMemo(
    () => (
      <View>
        {/* Category filter chips */}
        <FlatList
          horizontal
          data={ALL_CATEGORIES}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <CategoryChip
              category={item}
              selected={selectedCategory === item}
              onPress={handleCategoryPress}
            />
          )}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipScroll}
          style={styles.chipContainer}
        />
      </View>
    ),
    [selectedCategory, handleCategoryPress],
  );

  const ListEmptyComponent = useMemo(
    () => (
      <View style={styles.emptyState}>
        <Icon
          name="tag-off-outline"
          size={64}
          color={theme.colors.outlineVariant}
        />
        <Text
          variant="titleMedium"
          style={[styles.emptyTitle, { color: theme.colors.onSurface }]}
        >
          {activeTab === "completed"
            ? i18n.t("offers.noCompleted")
            : i18n.t("offers.noAvailable")}
        </Text>
        <Text
          variant="bodyMedium"
          style={[styles.emptySubtitle, { color: theme.colors.onSurfaceVariant }]}
        >
          {activeTab === "completed"
            ? i18n.t("offers.completedWillAppear")
            : i18n.t("offers.createNewForBuilding")}
        </Text>
      </View>
    ),
    [theme, activeTab],
  );

  return (
    <SafeAreaView
      edges={["bottom"]}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      {/* ---- Tab Selector ---- */}
      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const isActive = activeTab === tab.value;
          return (
            <Pressable
              key={tab.value}
              style={[
                styles.tab,
                isActive && {
                  backgroundColor: theme.colors.primaryContainer,
                  borderColor: theme.colors.primary,
                },
                !isActive && {
                  backgroundColor: theme.colors.surface,
                  borderColor: theme.colors.outlineVariant,
                },
              ]}
              onPress={() => setActiveTab(tab.value)}
            >
              <Text
                variant="labelMedium"
                style={[
                  styles.tabLabel,
                  {
                    color: isActive
                      ? theme.colors.primary
                      : theme.colors.onSurfaceVariant,
                  },
                ]}
              >
                {i18n.t(tab.labelKey)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* ---- Offer List ---- */}
      <FlatList
        data={offers}
        renderItem={renderOffer}
        keyExtractor={keyExtractor}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={isLoading ? null : ListEmptyComponent}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={onRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      {/* ---- Loading Skeleton Placeholder ---- */}
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

      {/* ---- FAB ---- */}
      <FAB
        icon="plus"
        label={i18n.t("offers.newOffer")}
        style={[
          styles.fab,
          { backgroundColor: theme.colors.primary },
        ]}
        color={theme.colors.onPrimary}
        onPress={() => {
          router.push("/create-offer");
        }}
      />

      {/* ---- Snackbar ---- */}
      <Snackbar
        visible={!!joinSnackbar}
        onDismiss={() => setJoinSnackbar(null)}
        duration={3000}
        action={{
          label: i18n.t("offers.close"),
          onPress: () => setJoinSnackbar(null),
        }}
      >
        {joinSnackbar ?? ""}
      </Snackbar>
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

  // Tab bar
  tabBar: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tabLabel: {
    fontWeight: "700",
    fontSize: 13,
  },

  // Category chips
  chipContainer: {
    marginBottom: 8,
  },
  chipScroll: {
    paddingHorizontal: 16,
    paddingVertical: 4,
  },

  // List
  listContent: {
    paddingBottom: 100,
  },
  separator: {
    height: 4,
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    fontWeight: "700",
    marginTop: 16,
    textAlign: "center",
  },
  emptySubtitle: {
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },

  // Loading
  loadingContainer: {
    position: "absolute",
    top: 120,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    gap: 12,
  },
  skeleton: {
    height: 200,
    borderRadius: 16,
  },

  // FAB
  fab: {
    position: "absolute",
    bottom: 24,
    alignSelf: "center",
    borderRadius: 28,
    elevation: 4,
  },
});
