import type { OfferStatus, ProjectWithStats, ServiceCategory } from "@groupio/types";
import { useRouter } from "expo-router";
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
  useTheme,
  SegmentedButtons,
  ActivityIndicator,
  ProgressBar,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

import { useContractorProjects } from "../lib/hooks";
import i18n from "../lib/i18n";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_FILTERS: { value: OfferStatus | "all"; labelKey: string }[] = [
  { value: "all", labelKey: "contractor.statusAll" },
  { value: "in_progress", labelKey: "contractor.statusInProgress" },
  { value: "completed", labelKey: "contractor.statusCompleted" },
  { value: "pending", labelKey: "contractor.statusPending" },
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
// Project Row
// ---------------------------------------------------------------------------

interface ProjectRowProps {
  project: ProjectWithStats;
  onPress: (project: ProjectWithStats) => void;
}

function ProjectRow({ project, onPress }: ProjectRowProps) {
  const theme = useTheme();
  const status = STATUS_CONFIG[project.status];

  const progressValue =
    project.status === "completed"
      ? 1
      : project.status === "in_progress"
        ? 0.5
        : 0.1;

  return (
    <Card
      style={[styles.projectCard, { backgroundColor: theme.colors.surface }]}
      mode="elevated"
      onPress={() => onPress(project)}
    >
      <Card.Content style={styles.projectContent}>
        <View style={styles.projectHeader}>
          <View style={styles.projectTitleWrap}>
            <Text
              variant="titleSmall"
              style={[styles.projectTitle, { color: theme.colors.onSurface }]}
              numberOfLines={1}
            >
              {project.title ?? i18n.t(CATEGORY_KEYS[project.category])}
            </Text>
            {project.buildingAddress && (
              <View style={styles.addressRow}>
                <Icon
                  name="map-marker-outline"
                  size={14}
                  color={theme.colors.onSurfaceVariant}
                />
                <Text
                  variant="bodySmall"
                  style={{ color: theme.colors.onSurfaceVariant }}
                  numberOfLines={1}
                >
                  {project.buildingAddress}
                </Text>
              </View>
            )}
          </View>
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

        <View style={styles.projectMeta}>
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
              {project.participantCount ?? project.participants} {i18n.t("contractor.participants")}
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
              ₪{(project.finalPrice ?? project.totalPrice).toLocaleString()}
            </Text>
          </View>

          {project.startDate && (
            <View style={styles.metaItem}>
              <Icon
                name="calendar-start"
                size={16}
                color={theme.colors.onSurfaceVariant}
              />
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                {new Date(project.startDate).toLocaleDateString("he-IL")}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.progressSection}>
          <ProgressBar
            progress={progressValue}
            color={status.color}
            style={[
              styles.progressBar,
              { backgroundColor: theme.colors.surfaceVariant },
            ]}
          />
        </View>
      </Card.Content>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function ContractorProjectsScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [statusFilter, setStatusFilter] = useState<OfferStatus | "all">("all");

  const filters =
    statusFilter === "all" ? undefined : { status: statusFilter };

  const {
    data: projectsData,
    isLoading,
    refetch,
    isRefetching,
  } = useContractorProjects(filters);

  const projects = projectsData?.data ?? [];

  const handleProjectPress = useCallback(
    (project: ProjectWithStats) => {
      router.push(`/offer-detail?id=${project.offerId}` as never);
    },
    [router],
  );

  const renderProject = useCallback(
    ({ item }: { item: ProjectWithStats }) => (
      <ProjectRow project={item} onPress={handleProjectPress} />
    ),
    [handleProjectPress],
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
            {i18n.t("contractor.myProjects")}
          </Text>
          <View style={styles.placeholder} />
        </View>

        <View style={styles.filterRow}>
          <SegmentedButtons
            value={statusFilter}
            onValueChange={(val) =>
              setStatusFilter(val as OfferStatus | "all")
            }
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
          data={projects}
          renderItem={renderProject}
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
                name="clipboard-text-off-outline"
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
                {i18n.t("contractor.noProjects")}
              </Text>
              <Text
                variant="bodySmall"
                style={{
                  color: theme.colors.onSurfaceVariant,
                  textAlign: "center",
                  marginTop: 4,
                }}
              >
                {i18n.t("contractor.projectsWillAppear")}
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
  placeholder: {
    width: 32,
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

  // Project card
  projectCard: {
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 14,
    elevation: 1,
  },
  projectContent: {
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  projectHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
  },
  projectTitleWrap: {
    flex: 1,
    marginEnd: 8,
  },
  projectTitle: {
    fontWeight: "700",
    fontSize: 15,
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  statusChip: {
    height: 26,
    borderRadius: 8,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: "600",
  },
  projectMeta: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 10,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  progressSection: {
    marginTop: 2,
  },
  progressBar: {
    height: 5,
    borderRadius: 3,
  },

  // Empty
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 60,
  },
});
