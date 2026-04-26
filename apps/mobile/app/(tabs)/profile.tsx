import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  I18nManager,
  Alert,
  Pressable,
  Linking,
  TouchableOpacity,
} from "react-native";
import {
  Text,
  Avatar,
  Card,
  Switch,
  Button,
  useTheme,
  Divider,
  IconButton,
  ActivityIndicator,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

import { uploadAvatar, setAuthToken } from "../../lib/api";
import type { ProfileResponse } from "../../lib/api";
import { useProfile, useUpdateProfile, useContractorStats } from "../../lib/hooks";
import i18n from "../../lib/i18n";
import { storage } from "../../lib/storage";
import { useAuth } from "../_layout";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type Language = "he" | "en";

const LANGUAGES: { key: Language; label: string; flag: string }[] = [
  { key: "he", label: "עברית", flag: "🇮🇱" },
  { key: "en", label: "English", flag: "🇺🇸" },
];

function getTrustLabel(key: string): string {
  return i18n.t(`trust.${key}`, { defaultValue: key });
}

// ---------------------------------------------------------------------------
// Section wrapper
// ---------------------------------------------------------------------------

interface SectionProps {
  title: string;
  icon: string;
  children: React.ReactNode;
}

function Section({ title, icon, children }: SectionProps) {
  const theme = useTheme();
  return (
    <Card
      style={[styles.sectionCard, { backgroundColor: theme.colors.surface }]}
      mode="elevated"
    >
      <Card.Content>
        <View style={styles.sectionHeader}>
          <View
            style={[
              styles.sectionIconWrap,
              { backgroundColor: theme.colors.primaryContainer },
            ]}
          >
            <Icon name={icon} size={20} color={theme.colors.primary} />
          </View>
          <Text
            variant="titleSmall"
            style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
          >
            {title}
          </Text>
        </View>
        {children}
      </Card.Content>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Info row
// ---------------------------------------------------------------------------

interface InfoRowProps {
  icon: string;
  label: string;
  value: string;
  iconColor?: string;
  onPress?: () => void;
  testID?: string;
}

function InfoRow({ icon, label, value, iconColor, onPress, testID }: InfoRowProps) {
  const theme = useTheme();
  const body = (
    <View style={styles.infoRow}>
      <Icon
        name={icon}
        size={20}
        color={iconColor ?? theme.colors.onSurfaceVariant}
      />
      <View style={styles.infoContent}>
        <Text
          variant="bodySmall"
          style={{ color: theme.colors.onSurfaceVariant }}
        >
          {label}
        </Text>
        {value ? (
          <Text
            variant="bodyMedium"
            style={[styles.infoValue, { color: theme.colors.onSurface }]}
          >
            {value}
          </Text>
        ) : null}
      </View>
      {onPress ? (
        <Icon
          name="chevron-right"
          size={20}
          color={theme.colors.onSurfaceVariant}
        />
      ) : null}
    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} testID={testID} accessibilityRole="button">
        {body}
      </TouchableOpacity>
    );
  }
  return <View testID={testID}>{body}</View>;
}

// ---------------------------------------------------------------------------
// Setting row with switch
// ---------------------------------------------------------------------------

interface SettingToggleProps {
  icon: string;
  label: string;
  description?: string;
  value: boolean;
  onToggle: (value: boolean) => void;
}

function SettingToggle({
  icon,
  label,
  description,
  value,
  onToggle,
}: SettingToggleProps) {
  const theme = useTheme();
  return (
    <View style={styles.settingRow}>
      <Icon name={icon} size={20} color={theme.colors.onSurfaceVariant} />
      <View style={styles.settingContent}>
        <Text
          variant="bodyMedium"
          style={[styles.settingLabel, { color: theme.colors.onSurface }]}
        >
          {label}
        </Text>
        {description && (
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {description}
          </Text>
        )}
      </View>
      <Switch value={value} onValueChange={onToggle} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { logout } = useAuth();

  // Determine user role
  const [userRole, setUserRole] = React.useState<string>("resident");
  React.useEffect(() => {
    storage.getUser().then((u) => {
      if (u?.role) setUserRole(u.role);
    });
  }, []);
  const isContractor = userRole === "contractor";

  // Data
  const { data: profile, isLoading: profileLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const { data: contractorStats } = useContractorStats({
    enabled: isContractor,
  });

  // Local state for toggling (optimistic UI)
  const [localNotifications, setLocalNotifications] = useState<boolean | null>(
    null,
  );
  const [localNewOfferAlerts, setLocalNewOfferAlerts] = useState(true);
  const [localPriceDropAlerts, setLocalPriceDropAlerts] = useState(true);
  const [localChatNotifications, setLocalChatNotifications] = useState(true);
  const [selectedLanguage, setSelectedLanguage] = useState<Language | null>(
    null,
  );
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Derived
  const notificationsEnabled =
    localNotifications ?? profile?.notificationsEnabled ?? true;
  const language =
    selectedLanguage ?? ((profile?.language ?? "he") as Language);

  // Handlers
  const handleToggleNotifications = useCallback(
    (value: boolean) => {
      setLocalNotifications(value);
      updateProfile.mutate({ notificationsEnabled: value });
    },
    [updateProfile],
  );

  const handleLanguageChange = useCallback(
    (lang: Language) => {
      setSelectedLanguage(lang);
      updateProfile.mutate({ language: lang });

      if (
        (lang === "en" && I18nManager.isRTL) ||
        (lang === "he" && !I18nManager.isRTL)
      ) {
        Alert.alert(
          i18n.t("profile.languageChanged"),
          i18n.t("profile.appWillRestart"),
          [{ text: i18n.t("profile.confirm") }],
        );
      }
    },
    [updateProfile],
  );

  const handleEditAvatar = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (!result.canceled && result.assets[0]) {
        setAvatarUploading(true);
        try {
          await uploadAvatar(result.assets[0].uri);
        } catch {
          Alert.alert(
            i18n.t("profile.avatarUploadError"),
            i18n.t("profile.avatarUploadErrorMsg"),
          );
        } finally {
          setAvatarUploading(false);
        }
      }
    } catch {
      // User cancelled or permission denied
    }
  }, []);

  const handleLogout = useCallback(() => {
    Alert.alert(
      i18n.t("profile.logoutTitle"),
      i18n.t("profile.logoutConfirm"),
      [
        { text: i18n.t("profile.cancel"), style: "cancel" },
        {
          text: i18n.t("profile.logout"),
          style: "destructive",
          onPress: () => void logout(),
        },
      ],
    );
  }, [logout]);

  // Loading
  if (profileLoading) {
    return (
      <SafeAreaView
        edges={["bottom"]}
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const userName = profile?.name ?? i18n.t("profile.user") ?? "";
  const userInitials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2);

  return (
    <SafeAreaView
      edges={["bottom"]}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ---- Avatar + Name ---- */}
        <View style={styles.avatarSection}>
          <Pressable onPress={handleEditAvatar} style={styles.avatarWrap}>
            {profile?.avatar ? (
              <Avatar.Image
                size={96}
                source={{ uri: profile.avatar }}
              />
            ) : (
              <Avatar.Text
                size={96}
                label={userInitials}
                style={{ backgroundColor: theme.colors.primaryContainer }}
                labelStyle={{
                  color: theme.colors.onPrimaryContainer,
                  fontSize: 32,
                  fontWeight: "700",
                }}
              />
            )}
            {/* Edit badge */}
            <View
              style={[
                styles.editBadge,
                { backgroundColor: theme.colors.primary },
              ]}
            >
              {avatarUploading ? (
                <ActivityIndicator size={14} color={theme.colors.onPrimary} />
              ) : (
                <Icon name="camera" size={14} color={theme.colors.onPrimary} />
              )}
            </View>
          </Pressable>
          <Text
            variant="headlineSmall"
            style={[styles.userName, { color: theme.colors.onSurface }]}
          >
            {userName}
          </Text>
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant }}
          >
            {profile?.email ?? ""}
          </Text>
        </View>

        {/* ---- Personal Info ---- */}
        <Section
          title={i18n.t("profile.personalInfo")}
          icon="account-outline"
        >
          <View style={styles.infoList}>
            <InfoRow
              icon="account"
              label={i18n.t("profile.fullName")}
              value={profile?.name ?? "-"}
            />
            <Divider style={styles.infoDivider} />
            <InfoRow
              icon="email-outline"
              label={i18n.t("profile.email")}
              value={profile?.email ?? "-"}
            />
            <Divider style={styles.infoDivider} />
            <InfoRow
              icon="phone-outline"
              label={i18n.t("profile.phone")}
              value={profile?.phone ?? "-"}
            />
          </View>
        </Section>

        {/* ---- Building Info ---- */}
        <Section
          title={i18n.t("profile.buildingInfo")}
          icon="office-building"
        >
          <View style={styles.infoList}>
            <InfoRow
              icon="map-marker-outline"
              label={i18n.t("profile.address")}
              value={profile?.building?.address ?? "-"}
              iconColor={theme.colors.secondary}
            />
            <Divider style={styles.infoDivider} />
            <InfoRow
              icon="city-variant-outline"
              label={i18n.t("profile.city")}
              value={profile?.building?.city ?? "-"}
              iconColor={theme.colors.secondary}
            />
            <Divider style={styles.infoDivider} />
            <InfoRow
              icon="door"
              label={i18n.t("profile.units")}
              value={
                profile?.building?.units
                  ? String(profile.building.units)
                  : "-"
              }
              iconColor={theme.colors.secondary}
            />
            <Divider style={styles.infoDivider} />
            <InfoRow
              icon="calendar-outline"
              label={i18n.t("profile.buildingAge")}
              value={
                profile?.building?.age
                  ? `${profile.building.age} ${i18n.t("profile.years")}`
                  : "-"
              }
              iconColor={theme.colors.secondary}
            />
          </View>
        </Section>

        {/* ---- Contractor Info (only for contractors) ---- */}
        {isContractor && (
          <>
            <Section title={i18n.t("contractor.trustScore")} icon="shield-check">
              <View style={styles.trustScoreSection}>
                <View style={styles.trustScoreRow}>
                  <View
                    style={[
                      styles.trustScoreCircle,
                      { borderColor: theme.colors.primary },
                    ]}
                  >
                    <Text
                      variant="headlineMedium"
                      style={[
                        styles.trustScoreValue,
                        { color: theme.colors.primary },
                      ]}
                    >
                      {contractorStats?.trustScore ?? 0}
                    </Text>
                    <Text
                      variant="labelSmall"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      {i18n.t("contractor.outOf100")}
                    </Text>
                  </View>
                  <View style={styles.trustBreakdown}>
                    {contractorStats?.trustBreakdown ? (
                      Object.entries(contractorStats.trustBreakdown).map(
                        ([key, value]) => (
                          <View key={key} style={styles.trustItem}>
                            <Text
                              variant="bodySmall"
                              style={{ color: theme.colors.onSurfaceVariant, flex: 1 }}
                            >
                              {getTrustLabel(key)}
                            </Text>
                            <View
                              style={[
                                styles.trustBar,
                                { backgroundColor: theme.colors.surfaceVariant },
                              ]}
                            >
                              <View
                                style={[
                                  styles.trustBarFill,
                                  {
                                    backgroundColor: theme.colors.primary,
                                    width: `${Math.min(value, 100)}%`,
                                  },
                                ]}
                              />
                            </View>
                            <Text
                              variant="labelSmall"
                              style={{ color: theme.colors.onSurfaceVariant, width: 28, textAlign: "center" }}
                            >
                              {value}
                            </Text>
                          </View>
                        ),
                      )
                    ) : (
                      <Text
                        variant="bodySmall"
                        style={{ color: theme.colors.onSurfaceVariant }}
                      >
                        {i18n.t("contractor.noTrustData")}
                      </Text>
                    )}
                  </View>
                </View>
              </View>
            </Section>

            <Section title={i18n.t("contractor.verificationStatus")} icon="check-decagram">
              <View style={styles.infoList}>
                <InfoRow
                  icon="file-document-outline"
                  label={i18n.t("contractor.businessLicense")}
                  value={i18n.t("contractor.verified")}
                  iconColor={theme.colors.tertiary}
                />
                <Divider style={styles.infoDivider} />
                <InfoRow
                  icon="shield-outline"
                  label={i18n.t("contractor.insurance")}
                  value={i18n.t("contractor.valid")}
                  iconColor={theme.colors.tertiary}
                />
                <Divider style={styles.infoDivider} />
                <InfoRow
                  icon="upload-outline"
                  label={i18n.t("contractor.documents")}
                  value={i18n.t("contractor.uploaded")}
                  iconColor={theme.colors.tertiary}
                />
              </View>
            </Section>

            <Section title={i18n.t("contractor.manage") || "Manage"} icon="cog">
              <View style={styles.infoList}>
                <InfoRow
                  icon="account-edit-outline"
                  label={i18n.t("contractor.editProfile") || "Edit business profile"}
                  value=""
                  onPress={() => router.push("/contractor-profile")}
                  iconColor={theme.colors.primary}
                  testID="profile-tab-link-contractor-profile"
                />
                <Divider style={styles.infoDivider} />
                <InfoRow
                  icon="cash-multiple"
                  label={i18n.t("contractor.viewEarnings") || "View earnings"}
                  value=""
                  onPress={() => router.push("/contractor-earnings")}
                  iconColor={theme.colors.primary}
                  testID="profile-tab-link-contractor-earnings"
                />
              </View>
            </Section>
          </>
        )}

        {/* ---- Notification Settings ---- */}
        <Section
          title={i18n.t("profile.notifications")}
          icon="bell-outline"
        >
          <View style={styles.settingsList}>
            <SettingToggle
              icon="bell-ring-outline"
              label={i18n.t("profile.pushNotifications")}
              description={i18n.t("profile.pushDescription")}
              value={notificationsEnabled}
              onToggle={handleToggleNotifications}
            />
            <Divider style={styles.settingDivider} />
            <SettingToggle
              icon="tag-outline"
              label={i18n.t("profile.newOffers")}
              description={i18n.t("profile.newOffersDescription")}
              value={localNewOfferAlerts}
              onToggle={setLocalNewOfferAlerts}
            />
            <Divider style={styles.settingDivider} />
            <SettingToggle
              icon="arrow-down-bold-outline"
              label={i18n.t("profile.priceDrops")}
              description={i18n.t("profile.priceDropsDescription")}
              value={localPriceDropAlerts}
              onToggle={setLocalPriceDropAlerts}
            />
            <Divider style={styles.settingDivider} />
            <SettingToggle
              icon="chat-outline"
              label={i18n.t("profile.chatMessages")}
              description={i18n.t("profile.chatMessagesDescription")}
              value={localChatNotifications}
              onToggle={setLocalChatNotifications}
            />
          </View>
        </Section>

        {/* ---- Language Selector ---- */}
        <Section
          title={i18n.t("profile.language")}
          icon="translate"
        >
          <View style={styles.languageRow}>
            {LANGUAGES.map((lang) => {
              const isSelected = language === lang.key;
              return (
                <Pressable
                  key={lang.key}
                  style={[
                    styles.languageOption,
                    {
                      backgroundColor: isSelected
                        ? theme.colors.primaryContainer
                        : theme.colors.surfaceVariant,
                      borderColor: isSelected
                        ? theme.colors.primary
                        : theme.colors.outlineVariant,
                    },
                  ]}
                  onPress={() => handleLanguageChange(lang.key)}
                >
                  <Text style={styles.languageFlag}>{lang.flag}</Text>
                  <Text
                    variant="bodyMedium"
                    style={[
                      styles.languageLabel,
                      {
                        color: isSelected
                          ? theme.colors.primary
                          : theme.colors.onSurface,
                        fontWeight: isSelected ? "700" : "500",
                      },
                    ]}
                  >
                    {lang.label}
                  </Text>
                  {isSelected && (
                    <Icon
                      name="check-circle"
                      size={20}
                      color={theme.colors.primary}
                    />
                  )}
                </Pressable>
              );
            })}
          </View>
        </Section>

        {/* ---- App Info ---- */}
        <View style={styles.appInfo}>
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant, textAlign: "center" }}
          >
            Groupio v0.1.0
          </Text>
          <Pressable
            onPress={() => Linking.openURL("https://groupio.co.il/terms")}
          >
            <Text
              variant="bodySmall"
              style={{
                color: theme.colors.primary,
                textAlign: "center",
                marginTop: 4,
              }}
            >
              {i18n.t("profile.termsAndPrivacy")}
            </Text>
          </Pressable>
        </View>

        {/* ---- Logout ---- */}
        <Button
          mode="outlined"
          onPress={handleLogout}
          icon="logout"
          textColor={theme.colors.error}
          style={[styles.logoutButton, { borderColor: theme.colors.error }]}
          contentStyle={styles.logoutButtonContent}
          labelStyle={styles.logoutButtonLabel}
        >
          {i18n.t("profile.logout")}
        </Button>

        <View style={styles.bottomSpacer} />
      </ScrollView>
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
  scrollContent: {
    paddingTop: 8,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },

  // Avatar section
  avatarSection: {
    alignItems: "center",
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  avatarWrap: {
    position: "relative",
    marginBottom: 12,
  },
  editBadge: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  userName: {
    fontWeight: "800",
    fontSize: 22,
    marginBottom: 2,
  },

  // Section card
  sectionCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 16,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 14,
    gap: 10,
  },
  sectionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontWeight: "700",
    fontSize: 15,
  },

  // Info rows
  infoList: {
    gap: 0,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
  },
  infoContent: {
    flex: 1,
    gap: 1,
  },
  infoValue: {
    fontWeight: "600",
    fontSize: 15,
  },
  infoDivider: {
    marginStart: 32,
  },

  // Settings
  settingsList: {
    gap: 0,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 12,
  },
  settingContent: {
    flex: 1,
    gap: 1,
  },
  settingLabel: {
    fontWeight: "600",
    fontSize: 14,
  },
  settingDivider: {
    marginStart: 32,
  },

  // Language
  languageRow: {
    flexDirection: "row",
    gap: 12,
  },
  languageOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    gap: 8,
  },
  languageFlag: {
    fontSize: 20,
  },
  languageLabel: {
    fontSize: 15,
  },

  // App info
  appInfo: {
    paddingVertical: 16,
    paddingHorizontal: 20,
  },

  // Logout
  logoutButton: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  logoutButtonContent: {
    height: 48,
  },
  logoutButtonLabel: {
    fontSize: 15,
    fontWeight: "700",
  },

  bottomSpacer: {
    height: 32,
  },

  // Contractor trust score
  trustScoreSection: {
    gap: 12,
  },
  trustScoreRow: {
    flexDirection: "row",
    gap: 16,
    alignItems: "flex-start",
  },
  trustScoreCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  trustScoreValue: {
    fontWeight: "800",
    fontSize: 24,
    lineHeight: 28,
  },
  trustBreakdown: {
    flex: 1,
    gap: 6,
  },
  trustItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  trustBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: "hidden" as const,
  },
  trustBarFill: {
    height: "100%" as const,
    borderRadius: 3,
  },
});
