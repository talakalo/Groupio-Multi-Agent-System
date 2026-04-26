import type { Offer, OfferStatus, ServiceCategory } from "@groupio/types";
import { useRouter } from "expo-router";
import React, { useCallback } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
  I18nManager,
  Pressable,
} from "react-native";
import {
  Text,
  Card,
  useTheme,
  Avatar,
  Divider,
  Chip,
  Button,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

import { MobileOfferCard } from "../../components/MobileOfferCard";
import { StatCard } from "../../components/StatCard";
import type { ActivityItem, NewsItem } from "../../lib/api";
import {
  useProfile,
  useOffers,
  useActivityFeed,
  useBuildingNews,
  useContractorStats,
  useContractorOffers,
  useContractorProjects,
} from "../../lib/hooks";
import i18n from "../../lib/i18n";
import { storage } from "../../lib/storage";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const QUICK_ACTIONS = [
  {
    key: "new_offer" as const,
    icon: "plus-circle",
    labelKey: "home.newOffer" as const,
    color: "#1a9a76",
    bg: "#d1f0e6",
  },
  {
    key: "find_contractor" as const,
    icon: "account-search",
    labelKey: "home.findContractor" as const,
    color: "#f59e0b",
    bg: "#fef3c7",
  },
  {
    key: "chat" as const,
    icon: "chat-processing",
    labelKey: "home.aiChat" as const,
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

const CONTRACTOR_QUICK_ACTIONS = [
  {
    key: "create_offer" as const,
    icon: "plus-circle",
    labelKey: "contractor.createOffer" as const,
    color: "#1a9a76",
    bg: "#d1f0e6",
  },
  {
    key: "my_offers" as const,
    icon: "tag-multiple",
    labelKey: "contractor.myOffers" as const,
    color: "#1565C0",
    bg: "#E3F2FD",
  },
  {
    key: "my_projects" as const,
    icon: "clipboard-list",
    labelKey: "contractor.projects" as const,
    color: "#f59e0b",
    bg: "#fef3c7",
  },
  {
    key: "messages" as const,
    icon: "chat-processing",
    labelKey: "contractor.messages" as const,
    color: "#2E7D32",
    bg: "#E8F5E9",
  },
] as const;

const OFFER_STATUS_KEYS: Record<string, string> = {
  active: "status.active",
  in_progress: "status.in_progress",
  completed: "status.completed",
  pending: "status.pending",
  draft: "status.draft",
  cancelled: "status.cancelled",
  expired: "status.expired",
};

const CATEGORY_KEYS: Record<string, string> = {
  ac_installation: "categories.ac_installation",
  ac_maintenance: "categories.ac_maintenance",
  kitchen: "categories.kitchen",
  electrical: "categories.electrical",
  plumbing: "categories.plumbing",
  heating: "categories.heating",
  renovations: "categories.renovations",
  painting: "categories.painting",
  flooring: "categories.flooring",
  windows: "categories.windows",
  security: "categories.security",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function HomeScreen() {
  const theme = useTheme();
  const router = useRouter();

  // Determine user role
  const [userRole, setUserRole] = React.useState<string>("resident");
  React.useEffect(() => {
    storage.getUser().then((u) => {
      if (u?.role) setUserRole(u.role);
    });
  }, []);

  const isContractor = userRole === "contractor";

  // Data fetching
  const { data: profile } = useProfile();
  const buildingId = profile?.buildingId ?? "";

  const {
    data: offersData,
    isLoading: offersLoading,
    refetch: refetchOffers,
  } = useOffers(
    { status: "active", buildingId, limit: 5 },
    { enabled: !!buildingId && !isContractor },
  );

  const {
    data: activityItems,
    refetch: refetchActivity,
  } = useActivityFeed(buildingId, 10);

  const {
    data: newsItems,
    refetch: refetchNews,
  } = useBuildingNews(buildingId);

  // Contractor data
  const { data: contractorStats, refetch: refetchContractorStats } =
    useContractorStats({ enabled: isContractor });
  const { data: contractorOffersData, refetch: refetchContractorOffers } =
    useContractorOffers({ status: "active", limit: 5 }, { enabled: isContractor });
  const { data: contractorProjectsData, refetch: refetchContractorProjects } =
    useContractorProjects({ status: "in_progress", limit: 5 }, { enabled: isContractor });

  const [refreshing, setRefreshing] = React.useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (isContractor) {
      await Promise.all([
        refetchContractorStats(),
        refetchContractorOffers(),
        refetchContractorProjects(),
        refetchActivity(),
      ]);
    } else {
      await Promise.all([refetchOffers(), refetchActivity(), refetchNews()]);
    }
    setRefreshing(false);
  }, [
    isContractor,
    refetchOffers,
    refetchActivity,
    refetchNews,
    refetchContractorStats,
    refetchContractorOffers,
    refetchContractorProjects,
  ]);

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

  const handleContractorQuickAction = useCallback(
    (key: (typeof CONTRACTOR_QUICK_ACTIONS)[number]["key"]) => {
      switch (key) {
        case "create_offer":
          router.push("/create-offer" as never);
          break;
        case "my_offers":
          router.push("/contractor-offers" as never);
          break;
        case "my_projects":
          router.push("/contractor-projects" as never);
          break;
        case "messages":
          router.push("/chat" as never);
          break;
      }
    },
    [router],
  );

  // Computed
  const activeOffers = offersData?.data ?? [];
  const contractorOffersList = contractorOffersData?.data ?? [];
  const contractorProjectsList = contractorProjectsData?.data ?? [];
  const userName = profile?.name?.split(" ")[0] ?? i18n.t("profile.user") ?? "";
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
                {i18n.t("home.greeting", { name: userName })}
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
                  : i18n.t("home.welcomeTo")}
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

        {/* ---- No-building banner (resident only) ---- */}
        {!isContractor && !buildingId ? (
          <Card
            mode="contained"
            style={styles.joinBanner}
            testID="home-join-building-banner"
          >
            <Card.Content>
              <Text variant="titleMedium" style={styles.joinBannerTitle}>
                {i18n.t("home.noBuildingTitle") || "Join your building"}
              </Text>
              <Text
                variant="bodySmall"
                style={[
                  styles.joinBannerBody,
                  { color: theme.colors.onSurfaceVariant },
                ]}
              >
                {i18n.t("home.noBuildingHint") ||
                  "Enter the invite code your committee or buildings manager shared with you."}
              </Text>
              <Button
                mode="contained"
                onPress={() => router.push("/join-building")}
                style={styles.joinBannerCta}
                testID="home-join-building-cta"
              >
                {i18n.t("home.joinBuildingCta") || "Enter invite code"}
              </Button>
            </Card.Content>
          </Card>
        ) : null}

        {/* ---- Stats Row ---- */}
        {isContractor ? (
          <View style={styles.statsRow}>
            <StatCard
              title={i18n.t("contractor.activeOffers")}
              value={contractorStats?.activeOffers ?? 0}
              icon="tag-multiple"
              iconColor={theme.colors.primary}
              backgroundColor={theme.colors.primaryContainer}
            />
            <View style={styles.statSpacer} />
            <StatCard
              title={i18n.t("contractor.projects")}
              value={contractorStats?.completedProjects ?? 0}
              icon="clipboard-check"
              iconColor={theme.colors.secondary}
              backgroundColor={theme.colors.secondaryContainer}
            />
            <View style={styles.statSpacer} />
            <StatCard
              title={i18n.t("contractor.revenue")}
              value={
                contractorStats?.totalRevenue
                  ? `₪${Math.round(contractorStats.totalRevenue).toLocaleString()}`
                  : "₪0"
              }
              icon="currency-ils"
              iconColor={theme.colors.tertiary}
              backgroundColor={theme.colors.tertiaryContainer}
            />
          </View>
        ) : (
          <View style={styles.statsRow}>
            <StatCard
              title={i18n.t("home.activeOffers")}
              value={activeOffers.length}
              icon="tag-multiple"
              iconColor={theme.colors.primary}
              backgroundColor={theme.colors.primaryContainer}
            />
            <View style={styles.statSpacer} />
            <StatCard
              title={i18n.t("home.participants")}
              value={totalParticipants}
              icon="account-group"
              iconColor={theme.colors.secondary}
              backgroundColor={theme.colors.secondaryContainer}
            />
            <View style={styles.statSpacer} />
            <StatCard
              title={i18n.t("home.totalSavings")}
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
        )}

        {/* ---- Quick Actions ---- */}
        <View style={styles.sectionHeader}>
          <Text
            variant="titleMedium"
            style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
          >
            {isContractor ? i18n.t("contractor.quickActions") : i18n.t("home.quickActions")}
          </Text>
        </View>

        {isContractor ? (
          <View style={styles.quickActionsRow}>
            {CONTRACTOR_QUICK_ACTIONS.map((action) => (
              <Pressable
                key={action.key}
                style={({ pressed }) => [
                  styles.quickAction,
                  { backgroundColor: action.bg, opacity: pressed ? 0.7 : 1 },
                ]}
                onPress={() => handleContractorQuickAction(action.key)}
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
                  {i18n.t(action.labelKey)}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : (
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
                  {i18n.t(action.labelKey)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* ---- Contractor: Active Offers ---- */}
        {isContractor && contractorOffersList.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text
                variant="titleMedium"
                style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
              >
                {i18n.t("contractor.activeOffers")}
              </Text>
              <Pressable onPress={() => router.push("/contractor-offers" as never)}>
                <Text
                  variant="labelMedium"
                  style={{ color: theme.colors.primary }}
                >
                  {i18n.t("home.viewAll")}
                </Text>
              </Pressable>
            </View>
            {contractorOffersList.slice(0, 3).map((offer) => (
              <Card
                key={offer.id}
                style={[styles.contractorOfferRow, { backgroundColor: theme.colors.surface }]}
                mode="elevated"
                onPress={() => handleOfferPress(offer)}
              >
                <Card.Content style={styles.contractorOfferContent}>
                  <View style={styles.contractorOfferLeft}>
                    <Text
                      variant="bodyMedium"
                      style={[styles.contractorOfferTitle, { color: theme.colors.onSurface }]}
                      numberOfLines={1}
                    >
                      {CATEGORY_KEYS[offer.category] ? i18n.t(CATEGORY_KEYS[offer.category]) : offer.category}
                    </Text>
                    <Text
                      variant="bodySmall"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      {offer.participants} {i18n.t("contractor.participants")} · ₪{offer.basePrice.toLocaleString()}
                    </Text>
                  </View>
                  <Chip
                    compact
                    style={{ backgroundColor: OFFER_STATUS_KEYS[offer.status] ? "#E8F5E9" : "#F5F5F5" }}
                    textStyle={{ fontSize: 11, fontWeight: "600" }}
                  >
                    {OFFER_STATUS_KEYS[offer.status] ? i18n.t(OFFER_STATUS_KEYS[offer.status]) : offer.status}
                  </Chip>
                </Card.Content>
              </Card>
            ))}
          </>
        )}

        {/* ---- Contractor: Recent Projects ---- */}
        {isContractor && contractorProjectsList.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text
                variant="titleMedium"
                style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
              >
                {i18n.t("contractor.recentProjects")}
              </Text>
              <Pressable onPress={() => router.push("/contractor-projects" as never)}>
                <Text
                  variant="labelMedium"
                  style={{ color: theme.colors.primary }}
                >
                  {i18n.t("home.viewAll")}
                </Text>
              </Pressable>
            </View>
            {contractorProjectsList.slice(0, 3).map((project) => (
              <Card
                key={project.id}
                style={[styles.contractorOfferRow, { backgroundColor: theme.colors.surface }]}
                mode="elevated"
                onPress={() =>
                  router.push(`/offer-detail?id=${project.offerId}` as never)
                }
              >
                <Card.Content style={styles.contractorOfferContent}>
                  <View style={styles.contractorOfferLeft}>
                    <Text
                      variant="bodyMedium"
                      style={[styles.contractorOfferTitle, { color: theme.colors.onSurface }]}
                      numberOfLines={1}
                    >
                      {project.title ?? (CATEGORY_KEYS[project.category] ? i18n.t(CATEGORY_KEYS[project.category]) : project.category)}
                    </Text>
                    <Text
                      variant="bodySmall"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      {project.buildingAddress ?? ""} · {project.participants} {i18n.t("contractor.participants")}
                    </Text>
                  </View>
                  <Chip
                    compact
                    style={{
                      backgroundColor:
                        project.status === "in_progress" ? "#E3F2FD" : "#d1f0e6",
                    }}
                    textStyle={{ fontSize: 11, fontWeight: "600" }}
                  >
                    {OFFER_STATUS_KEYS[project.status] ? i18n.t(OFFER_STATUS_KEYS[project.status]) : project.status}
                  </Chip>
                </Card.Content>
              </Card>
            ))}
          </>
        )}

        {/* ---- Resident: Active Offers (horizontal scroll) ---- */}
        {!isContractor && activeOffers.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text
                variant="titleMedium"
                style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
              >
                {i18n.t("home.activeOffers")}
              </Text>
              <Pressable onPress={() => router.push("/offers" as never)}>
                <Text
                  variant="labelMedium"
                  style={{ color: theme.colors.primary }}
                >
                  {i18n.t("home.viewAll")}
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
            {i18n.t("home.recentActivity")}
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
                  {i18n.t("home.noRecentActivity")}
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
            {i18n.t("home.buildingNews")}
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
                  {i18n.t("home.noNews")}
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

  if (diffMin < 1) return i18n.t("time.now");
  if (diffMin < 60) return i18n.t("time.minutesAgo", { count: diffMin });
  if (diffHr < 24) return i18n.t("time.hoursAgo", { count: diffHr });
  if (diffDay < 7) return i18n.t("time.daysAgo", { count: diffDay });
  return new Date(isoDate).toLocaleDateString(
    i18n.locale === "he" ? "he-IL" : "en-US",
  );
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

  joinBanner: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 16,
  },
  joinBannerTitle: {
    fontWeight: "600",
    marginBottom: 4,
  },
  joinBannerBody: {
    marginBottom: 12,
  },
  joinBannerCta: {
    alignSelf: "flex-start",
  },

  // Contractor compact offer/project rows
  contractorOfferRow: {
    marginHorizontal: 16,
    marginVertical: 3,
    borderRadius: 12,
    elevation: 1,
  },
  contractorOfferContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  contractorOfferLeft: {
    flex: 1,
    marginEnd: 10,
    gap: 2,
  },
  contractorOfferTitle: {
    fontWeight: "600",
    fontSize: 14,
  },

  bottomSpacer: {
    height: 24,
  },
});
