import React, { useCallback } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
  I18nManager,
  Pressable,
} from "react-native";
import { Text, Card, useTheme, Avatar, Divider } from "react-native-paper";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import type { Offer } from "@groupio/types";

import { StatCard } from "../../components/StatCard";
import { MobileOfferCard } from "../../components/MobileOfferCard";
import { useProfile, useOffers, useActivityFeed, useBuildingNews } from "../../lib/hooks";
import type { ActivityItem, NewsItem } from "../../lib/api";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUICK_ACTIONS = [
  {
    key: "new_offer" as const,
    icon: "plus-circle",
    label: "\u05D4\u05E6\u05E2\u05D4 \u05D7\u05D3\u05E9\u05D4",
    color: "#1976D2",
    bg: "#E3F2FD",
  },
  {
    key: "find_contractor" as const,
    icon: "account-search",
    label: "\u05DE\u05E6\u05D0 \u05E7\u05D1\u05DC\u05DF",
    color: "#FF6F00",
    bg: "#FFF3E0",
  },
  {
    key: "chat" as const,
    icon: "chat-processing",
    label: "\u05E6'\u05D0\u05D8 AI",
    color: "#2E7D32",
    bg: "#E8F5E9",
  },
] as const;

const ACTIVITY_ICONS: Record<ActivityItem["type"], string> = {
  offer_created: "tag-plus",
  offer_joined: "account-plus",
  offer_completed: "check-circle",
  new_review: "star",
  building_update: "office-building",
};

const NEWS_CATEGORY_ICONS: Record<NewsItem["category"], string> = {
  maintenance: "wrench",
  general: "information",
  offer: "tag",
  community: "account-group",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();

  // Data fetching
  const { data: profile } = useProfile();
  const buildingId = profile?.buildingId ?? "";

  const {
    data: offersData,
    isLoading: offersLoading,
    refetch: refetchOffers,
  } = useOffers(
    { status: "active", buildingId, limit: 5 },
    { enabled: !!buildingId },
  );

  const {
    data: activityItems,
    refetch: refetchActivity,
  } = useActivityFeed(buildingId, 10);

  const {
    data: newsItems,
    refetch: refetchNews,
  } = useBuildingNews(buildingId);

  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchOffers(), refetchActivity(), refetchNews()]);
    setRefreshing(false);
  }, [refetchOffers, refetchActivity, refetchNews]);

  // Navigation
  const handleQuickAction = useCallback(
    (key: (typeof QUICK_ACTIONS)[number]["key"]) => {
      switch (key) {
        case "new_offer":
          router.push("/offers" as never);
          break;
        case "find_contractor":
          router.push("/offers" as never);
          break;
        case "chat":
          router.push("/chat" as never);
          break;
      }
    },
    [router],
  );

  const handleOfferPress = useCallback(
    (offer: Offer) => {
      router.push(`/offers?id=${offer.id}` as never);
    },
    [router],
  );

  // Computed
  const activeOffers = offersData?.data ?? [];
  const userName = profile?.name?.split(" ")[0] ?? "\u05EA\u05D5\u05E9\u05D1";
  const totalParticipants = activeOffers.reduce(
    (sum, o) => sum + o.participants,
    0,
  );

  return (
    <SafeAreaView
      edges={["bottom"]}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* ---- Welcome Header ---- */}
        <View style={styles.welcomeSection}>
          <View style={styles.welcomeRow}>
            <View style={styles.welcomeTextContainer}>
              <Text
                variant="headlineSmall"
                style={[styles.welcomeTitle, { color: theme.colors.onSurface }]}
              >
                {"\u05E9\u05DC\u05D5\u05DD"}, {userName}!
              </Text>
              <Text
                variant="bodyMedium"
                style={[
                  styles.welcomeSubtitle,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                {profile?.building?.address
                  ? `${profile.building.address}, ${profile.building.city}`
                  : "\u05D1\u05E8\u05D5\u05DA \u05D4\u05D1\u05D0 \u05DC-Groupio"}
              </Text>
            </View>
            <Avatar.Text
              size={48}
              label={userName.substring(0, 2)}
              style={{ backgroundColor: theme.colors.primaryContainer }}
              labelStyle={{ color: theme.colors.onPrimaryContainer }}
            />
          </View>
        </View>

        {/* ---- Stats Row ---- */}
        <View style={styles.statsRow}>
          <StatCard
            title={"\u05D4\u05E6\u05E2\u05D5\u05EA \u05E4\u05E2\u05D9\u05DC\u05D5\u05EA"}
            value={activeOffers.length}
            icon="tag-multiple"
            iconColor={theme.colors.primary}
            backgroundColor={theme.colors.primaryContainer}
          />
          <View style={styles.statSpacer} />
          <StatCard
            title={"\u05DE\u05E9\u05EA\u05EA\u05E4\u05D9\u05DD"}
            value={totalParticipants}
            icon="account-group"
            iconColor={theme.colors.secondary}
            backgroundColor={theme.colors.secondaryContainer}
          />
          <View style={styles.statSpacer} />
          <StatCard
            title={"\u05D7\u05E1\u05DB\u05D5\u05DF \u05DB\u05D5\u05DC\u05DC"}
            value={
              activeOffers.length > 0
                ? `${Math.round(
                    activeOffers.reduce(
                      (s, o) =>
                        s + (o.tiers[o.currentTier]?.discount ?? 0),
                      0,
                    ) / activeOffers.length,
                  )}%`
                : "0%"
            }
            icon="percent"
            iconColor={theme.colors.tertiary}
            backgroundColor={theme.colors.tertiaryContainer}
          />
        </View>

        {/* ---- Quick Actions ---- */}
        <View style={styles.sectionHeader}>
          <Text
            variant="titleMedium"
            style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
          >
            {"\u05E4\u05E2\u05D5\u05DC\u05D5\u05EA \u05DE\u05D4\u05D9\u05E8\u05D5\u05EA"}
          </Text>
        </View>

        <View style={styles.quickActionsRow}>
          {QUICK_ACTIONS.map((action) => (
            <Pressable
              key={action.key}
              style={({ pressed }) => [
                styles.quickAction,
                { backgroundColor: action.bg, opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={() => handleQuickAction(action.key)}
            >
              <View
                style={[
                  styles.quickActionIconWrap,
                  { backgroundColor: action.color },
                ]}
              >
                <Icon name={action.icon} size={24} color="#FFFFFF" />
              </View>
              <Text
                variant="labelMedium"
                style={[styles.quickActionLabel, { color: action.color }]}
                numberOfLines={1}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ---- Active Offers (horizontal scroll) ---- */}
        {activeOffers.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text
                variant="titleMedium"
                style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
              >
                {"\u05D4\u05E6\u05E2\u05D5\u05EA \u05E4\u05E2\u05D9\u05DC\u05D5\u05EA"}
              </Text>
              <Pressable onPress={() => router.push("/offers" as never)}>
                <Text
                  variant="labelMedium"
                  style={{ color: theme.colors.primary }}
                >
                  {"\u05E6\u05E4\u05D4 \u05D1\u05D4\u05DB\u05DC"}
                </Text>
              </Pressable>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.offersHScroll}
              style={styles.offersHScrollContainer}
            >
              {activeOffers.map((offer) => (
                <View key={offer.id} style={styles.offerCardWrap}>
                  <MobileOfferCard
                    offer={offer}
                    onPress={handleOfferPress}
                  />
                </View>
              ))}
            </ScrollView>
          </>
        )}

        {/* ---- Recent Activity Feed ---- */}
        <View style={styles.sectionHeader}>
          <Text
            variant="titleMedium"
            style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
          >
            {"\u05E4\u05E2\u05D9\u05DC\u05D5\u05EA \u05D0\u05D7\u05E8\u05D5\u05E0\u05D5\u05EA"}
          </Text>
        </View>

        <Card
          style={[styles.activityCard, { backgroundColor: theme.colors.surface }]}
          mode="elevated"
        >
          <Card.Content>
            {activityItems && activityItems.length > 0 ? (
              activityItems.slice(0, 5).map((item, idx) => (
                <React.Fragment key={item.id}>
                  <View style={styles.activityRow}>
                    <View
                      style={[
                        styles.activityIconWrap,
                        { backgroundColor: theme.colors.primaryContainer },
                      ]}
                    >
                      <Icon
                        name={
                          ACTIVITY_ICONS[item.type] ?? "information-outline"
                        }
                        size={18}
                        color={theme.colors.primary}
                      />
                    </View>
                    <View style={styles.activityContent}>
                      <Text
                        variant="bodyMedium"
                        style={{ color: theme.colors.onSurface }}
                        numberOfLines={1}
                      >
                        {item.title}
                      </Text>
                      <Text
                        variant="bodySmall"
                        style={{ color: theme.colors.onSurfaceVariant }}
                        numberOfLines={2}
                      >
                        {item.description}
                      </Text>
                    </View>
                    <Text
                      variant="labelSmall"
                      style={[
                        styles.activityTime,
                        { color: theme.colors.onSurfaceVariant },
                      ]}
                    >
                      {formatRelativeTime(item.timestamp)}
                    </Text>
                  </View>
                  {idx < Math.min(activityItems.length, 5) - 1 && (
                    <Divider style={styles.activityDivider} />
                  )}
                </React.Fragment>
              ))
            ) : (
              <View style={styles.emptyState}>
                <Icon
                  name="history"
                  size={40}
                  color={theme.colors.outlineVariant}
                />
                <Text
                  variant="bodyMedium"
                  style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}
                >
                  {"\u05D0\u05D9\u05DF \u05E4\u05E2\u05D9\u05DC\u05D5\u05EA \u05D0\u05D7\u05E8\u05D5\u05E0\u05D5\u05EA \u05E2\u05D3\u05D9\u05D9\u05DF"}
                </Text>
              </View>
            )}
          </Card.Content>
        </Card>

        {/* ---- Building News ---- */}
        <View style={styles.sectionHeader}>
          <Text
            variant="titleMedium"
            style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
          >
            {"\u05D7\u05D3\u05E9\u05D5\u05EA \u05D4\u05D1\u05E0\u05D9\u05D9\u05DF"}
          </Text>
        </View>

        {newsItems && newsItems.length > 0 ? (
          newsItems.slice(0, 3).map((news) => (
            <Card
              key={news.id}
              style={[
                styles.newsCard,
                { backgroundColor: theme.colors.surface },
              ]}
              mode="elevated"
            >
              <Card.Content style={styles.newsContent}>
                <View
                  style={[
                    styles.newsIconWrap,
                    { backgroundColor: theme.colors.secondaryContainer },
                  ]}
                >
                  <Icon
                    name={NEWS_CATEGORY_ICONS[news.category] ?? "information"}
                    size={20}
                    color={theme.colors.secondary}
                  />
                </View>
                <View style={styles.newsTextWrap}>
                  <Text
                    variant="titleSmall"
                    style={{ color: theme.colors.onSurface }}
                    numberOfLines={1}
                  >
                    {news.title}
                  </Text>
                  <Text
                    variant="bodySmall"
                    style={{ color: theme.colors.onSurfaceVariant }}
                    numberOfLines={2}
                  >
                    {news.body}
                  </Text>
                  <Text
                    variant="labelSmall"
                    style={[
                      styles.newsDate,
                      { color: theme.colors.onSurfaceVariant },
                    ]}
                  >
                    {formatRelativeTime(news.createdAt)}
                  </Text>
                </View>
              </Card.Content>
            </Card>
          ))
        ) : (
          <Card
            style={[styles.newsCard, { backgroundColor: theme.colors.surface }]}
            mode="elevated"
          >
            <Card.Content>
              <View style={styles.emptyState}>
                <Icon
                  name="newspaper-variant-outline"
                  size={40}
                  color={theme.colors.outlineVariant}
                />
                <Text
                  variant="bodyMedium"
                  style={{ color: theme.colors.onSurfaceVariant, marginTop: 8 }}
                >
                  {"\u05D0\u05D9\u05DF \u05D7\u05D3\u05E9\u05D5\u05EA \u05DB\u05E8\u05D2\u05E2"}
                </Text>
              </View>
            </Card.Content>
          </Card>
        )}

        {/* Bottom spacing */}
        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatRelativeTime(isoDate: string): string {
  const now = Date.now();
  const then = new Date(isoDate).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 1) return "\u05E2\u05DB\u05E9\u05D9\u05D5";
  if (diffMin < 60) return `\u05DC\u05E4\u05E0\u05D9 ${diffMin} \u05D3\u05E7\u05D5\u05EA`;
  if (diffHr < 24) return `\u05DC\u05E4\u05E0\u05D9 ${diffHr} \u05E9\u05E2\u05D5\u05EA`;
  if (diffDay < 7) return `\u05DC\u05E4\u05E0\u05D9 ${diffDay} \u05D9\u05DE\u05D9\u05DD`;
  return new Date(isoDate).toLocaleDateString("he-IL");
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 8,
  },

  // Welcome
  welcomeSection: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  welcomeRow: {
    flexDirection: I18nManager.isRTL ? "row-reverse" : "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  welcomeTextContainer: {
    flex: 1,
    marginEnd: 12,
  },
  welcomeTitle: {
    fontWeight: "800",
    fontSize: 24,
    lineHeight: 32,
  },
  welcomeSubtitle: {
    fontSize: 14,
    marginTop: 2,
  },

  // Stats
  statsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  statSpacer: {
    width: 10,
  },

  // Section headers
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
  },
  sectionTitle: {
    fontWeight: "700",
    fontSize: 17,
  },

  // Quick actions
  quickActionsRow: {
    flexDirection: "row",
    paddingHorizontal: 16,
    gap: 10,
  },
  quickAction: {
    flex: 1,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    gap: 8,
  },
  quickActionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  quickActionLabel: {
    fontWeight: "700",
    fontSize: 12,
    textAlign: "center",
  },

  // Horizontal offers scroll
  offersHScrollContainer: {
    marginBottom: 4,
  },
  offersHScroll: {
    paddingStart: 4,
    paddingEnd: 16,
  },
  offerCardWrap: {
    width: 320,
  },

  // Activity
  activityCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    elevation: 2,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 10,
    gap: 12,
  },
  activityIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  activityContent: {
    flex: 1,
    gap: 2,
  },
  activityTime: {
    fontSize: 11,
    marginTop: 2,
  },
  activityDivider: {
    marginStart: 48,
  },

  // News
  newsCard: {
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 16,
    elevation: 2,
  },
  newsContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  newsIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  newsTextWrap: {
    flex: 1,
    gap: 2,
  },
  newsDate: {
    marginTop: 4,
    fontSize: 11,
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },

  bottomSpacer: {
    height: 24,
  },
});
