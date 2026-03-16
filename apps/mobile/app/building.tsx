import React, { useCallback } from "react";
import { View, ScrollView, StyleSheet, Share, Platform } from "react-native";
import {
  Text,
  Button,
  Divider,
  useTheme,
  ActivityIndicator,
  IconButton,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

import { useBuildingDetail } from "../lib/hooks";
import i18n from "../lib/i18n";

export default function BuildingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { buildingId } = useLocalSearchParams<{ buildingId: string }>();

  const {
    data: building,
    isLoading,
    isError,
  } = useBuildingDetail(buildingId ?? "");

  const handleShareInvite = useCallback(async () => {
    if (!building) return;
    try {
      await Share.share({
        message: `${i18n.t("building.shareInviteHint")}\n${building.name}\n${building.inviteCode}`,
        ...(Platform.OS === "ios" && {
          url: `https://groupio.co.il/join/${building.inviteCode}`,
        }),
      });
    } catch {
      // user cancelled or share failed
    }
  }, [building]);

  if (isLoading) {
    return (
      <SafeAreaView
        style={[styles.center, { backgroundColor: theme.colors.background }]}
      >
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </SafeAreaView>
    );
  }

  if (isError || !building) {
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
          {i18n.t("building.notFound")}
        </Text>
        <Button
          mode="text"
          onPress={() => router.back()}
          style={{ marginTop: 16 }}
        >
          {i18n.t("common.back")}
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
        <IconButton icon="arrow-right" onPress={() => router.back()} />
        <Text
          variant="titleLarge"
          style={{ fontWeight: "700", color: theme.colors.onSurface, flex: 1, textAlign: "center" }}
        >
          {i18n.t("building.title")}
        </Text>
        <View style={{ width: 48 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Building info card */}
        <View
          style={[
            styles.infoCard,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          <View
            style={[
              styles.buildingIcon,
              { backgroundColor: theme.colors.primaryContainer },
            ]}
          >
            <Icon
              name="office-building"
              size={40}
              color={theme.colors.primary}
            />
          </View>
          <Text
            variant="headlineSmall"
            style={{
              color: theme.colors.onSurface,
              fontWeight: "800",
              textAlign: "center",
              marginTop: 12,
            }}
          >
            {building.name}
          </Text>
          <View style={styles.addressRow}>
            <Icon
              name="map-marker"
              size={16}
              color={theme.colors.onSurfaceVariant}
            />
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurfaceVariant, marginStart: 4 }}
            >
              {building.address}
            </Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <View
            style={[
              styles.statCard,
              { backgroundColor: theme.colors.primaryContainer },
            ]}
          >
            <Icon
              name="account-group"
              size={28}
              color={theme.colors.primary}
            />
            <Text
              variant="headlineSmall"
              style={{ color: theme.colors.primary, fontWeight: "800" }}
            >
              {building.memberCount}
            </Text>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onPrimaryContainer }}
            >
              {i18n.t("building.residents")}
            </Text>
          </View>
          <View
            style={[
              styles.statCard,
              { backgroundColor: theme.colors.tertiaryContainer },
            ]}
          >
            <Icon
              name="tag-multiple"
              size={28}
              color={theme.colors.tertiary}
            />
            <Text
              variant="headlineSmall"
              style={{ color: theme.colors.tertiary, fontWeight: "800" }}
            >
              {building.activeOffers}
            </Text>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onTertiaryContainer }}
            >
              {i18n.t("building.activeOffers")}
            </Text>
          </View>
        </View>

        <Divider style={styles.divider} />

        {/* Invite code */}
        <Text
          variant="titleMedium"
          style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
        >
          {i18n.t("building.inviteCode")}
        </Text>
        <View
          style={[
            styles.inviteCard,
            { backgroundColor: theme.colors.surface },
          ]}
        >
          <View
            style={[
              styles.codeBox,
              {
                backgroundColor: theme.colors.surfaceVariant,
                borderColor: theme.colors.outlineVariant,
              },
            ]}
          >
            <Text
              variant="headlineMedium"
              style={{
                color: theme.colors.primary,
                fontWeight: "800",
                letterSpacing: 4,
              }}
            >
              {building.inviteCode}
            </Text>
          </View>
          <Text
            variant="bodySmall"
            style={{
              color: theme.colors.onSurfaceVariant,
              textAlign: "center",
              marginTop: 8,
              marginBottom: 12,
            }}
          >
            {i18n.t("building.shareInviteHint")}
          </Text>
          <Button
            mode="contained"
            onPress={handleShareInvite}
            icon="share-variant"
            style={styles.shareButton}
            contentStyle={styles.shareContent}
          >
            {i18n.t("building.shareInvite")}
          </Button>
        </View>

        <Divider style={styles.divider} />

        {/* Quick actions */}
        <Text
          variant="titleMedium"
          style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
        >
          {i18n.t("building.quickActions")}
        </Text>
        <Button
          mode="outlined"
          icon="tag-multiple"
          onPress={() => router.push("/(tabs)/offers")}
          style={styles.actionButton}
          contentStyle={styles.actionContent}
        >
          {i18n.t("building.viewBuildingOffers")}
        </Button>
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
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scrollContent: { padding: 16, paddingBottom: 40 },
  infoCard: {
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    elevation: 1,
    marginBottom: 16,
  },
  buildingIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 8,
  },
  statCard: {
    flex: 1,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    gap: 4,
  },
  divider: { marginVertical: 20 },
  sectionTitle: { fontWeight: "700", marginBottom: 12 },
  inviteCard: {
    borderRadius: 14,
    padding: 20,
    elevation: 1,
    alignItems: "center",
  },
  codeBox: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
  },
  shareButton: { borderRadius: 12, alignSelf: "stretch" },
  shareContent: { height: 44 },
  actionButton: { borderRadius: 12, marginBottom: 8 },
  actionContent: { height: 44 },
});
