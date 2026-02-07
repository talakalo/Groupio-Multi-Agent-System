import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  I18nManager,
  Alert,
  Pressable,
  Linking,
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
import * as ImagePicker from "expo-image-picker";

import { useProfile, useUpdateProfile } from "../../lib/hooks";
import { uploadAvatar, setAuthToken } from "../../lib/api";
import type { ProfileResponse } from "../../lib/api";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type Language = "he" | "en";

const LANGUAGES: { key: Language; label: string; flag: string }[] = [
  { key: "he", label: "\u05E2\u05D1\u05E8\u05D9\u05EA", flag: "\uD83C\uDDEE\uD83C\uDDF1" },
  { key: "en", label: "English", flag: "\uD83C\uDDFA\uD83C\uDDF8" },
];

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
}

function InfoRow({ icon, label, value, iconColor }: InfoRowProps) {
  const theme = useTheme();
  return (
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
        <Text
          variant="bodyMedium"
          style={[styles.infoValue, { color: theme.colors.onSurface }]}
        >
          {value}
        </Text>
      </View>
    </View>
  );
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

  // Data
  const { data: profile, isLoading: profileLoading } = useProfile();
  const updateProfile = useUpdateProfile();

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

      if (lang === "en" && I18nManager.isRTL) {
        Alert.alert(
          "Language Changed",
          "The app will restart to apply the new language direction.",
          [{ text: "OK" }],
        );
      } else if (lang === "he" && !I18nManager.isRTL) {
        Alert.alert(
          "\u05E9\u05E4\u05D4 \u05E9\u05D5\u05E0\u05EA\u05D4",
          "\u05D4\u05D0\u05E4\u05DC\u05D9\u05E7\u05E6\u05D9\u05D4 \u05EA\u05D5\u05E4\u05E2\u05DC \u05DE\u05D7\u05D3\u05E9 \u05DC\u05D4\u05D7\u05DC\u05EA \u05DB\u05D9\u05D5\u05D5\u05DF \u05D4\u05E9\u05E4\u05D4.",
          [{ text: "\u05D0\u05D9\u05E9\u05D5\u05E8" }],
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
            "\u05E9\u05D2\u05D9\u05D0\u05D4",
            "\u05DC\u05D0 \u05D4\u05E6\u05DC\u05D7\u05E0\u05D5 \u05DC\u05D4\u05E2\u05DC\u05D5\u05EA \u05D0\u05EA \u05D4\u05EA\u05DE\u05D5\u05E0\u05D4. \u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1.",
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
      "\u05D4\u05EA\u05E0\u05EA\u05E7\u05D5\u05EA",
      "\u05D4\u05D0\u05DD \u05D0\u05EA\u05D4 \u05D1\u05D8\u05D5\u05D7 \u05E9\u05D1\u05E8\u05E6\u05D5\u05E0\u05DA \u05DC\u05D4\u05EA\u05E0\u05EA\u05E7?",
      [
        { text: "\u05D1\u05D9\u05D8\u05D5\u05DC", style: "cancel" },
        {
          text: "\u05D4\u05EA\u05E0\u05EA\u05E7",
          style: "destructive",
          onPress: () => {
            setAuthToken(null);
            // Navigate to login screen via router
          },
        },
      ],
    );
  }, []);

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

  const userName = profile?.name ?? "\u05DE\u05E9\u05EA\u05DE\u05E9";
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
          title={"\u05DE\u05D9\u05D3\u05E2 \u05D0\u05D9\u05E9\u05D9"}
          icon="account-outline"
        >
          <View style={styles.infoList}>
            <InfoRow
              icon="account"
              label={"\u05E9\u05DD \u05DE\u05DC\u05D0"}
              value={profile?.name ?? "-"}
            />
            <Divider style={styles.infoDivider} />
            <InfoRow
              icon="email-outline"
              label={"\u05D0\u05D9\u05DE\u05D9\u05D9\u05DC"}
              value={profile?.email ?? "-"}
            />
            <Divider style={styles.infoDivider} />
            <InfoRow
              icon="phone-outline"
              label={"\u05D8\u05DC\u05E4\u05D5\u05DF"}
              value={profile?.phone ?? "-"}
            />
          </View>
        </Section>

        {/* ---- Building Info ---- */}
        <Section
          title={"\u05DE\u05D9\u05D3\u05E2 \u05D4\u05D1\u05E0\u05D9\u05D9\u05DF"}
          icon="office-building"
        >
          <View style={styles.infoList}>
            <InfoRow
              icon="map-marker-outline"
              label={"\u05DB\u05EA\u05D5\u05D1\u05EA"}
              value={profile?.building?.address ?? "-"}
              iconColor={theme.colors.secondary}
            />
            <Divider style={styles.infoDivider} />
            <InfoRow
              icon="city-variant-outline"
              label={"\u05E2\u05D9\u05E8"}
              value={profile?.building?.city ?? "-"}
              iconColor={theme.colors.secondary}
            />
            <Divider style={styles.infoDivider} />
            <InfoRow
              icon="door"
              label={"\u05DE\u05E1\u05E4\u05E8 \u05D3\u05D9\u05E8\u05D5\u05EA"}
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
              label={"\u05D2\u05D9\u05DC \u05D4\u05D1\u05E0\u05D9\u05D9\u05DF"}
              value={
                profile?.building?.age
                  ? `${profile.building.age} \u05E9\u05E0\u05D9\u05DD`
                  : "-"
              }
              iconColor={theme.colors.secondary}
            />
          </View>
        </Section>

        {/* ---- Notification Settings ---- */}
        <Section
          title={"\u05D4\u05EA\u05E8\u05D0\u05D5\u05EA"}
          icon="bell-outline"
        >
          <View style={styles.settingsList}>
            <SettingToggle
              icon="bell-ring-outline"
              label={"\u05D4\u05EA\u05E8\u05D0\u05D5\u05EA \u05E4\u05D5\u05E9"}
              description={
                "\u05E7\u05D1\u05DC \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA \u05D1\u05DE\u05DB\u05E9\u05D9\u05E8"
              }
              value={notificationsEnabled}
              onToggle={handleToggleNotifications}
            />
            <Divider style={styles.settingDivider} />
            <SettingToggle
              icon="tag-outline"
              label={"\u05D4\u05E6\u05E2\u05D5\u05EA \u05D7\u05D3\u05E9\u05D5\u05EA"}
              description={
                "\u05D4\u05EA\u05E8\u05D0\u05D4 \u05DB\u05E9\u05E0\u05E4\u05EA\u05D7\u05EA \u05D4\u05E6\u05E2\u05D4 \u05D7\u05D3\u05E9\u05D4 \u05D1\u05D1\u05E0\u05D9\u05D9\u05DF"
              }
              value={localNewOfferAlerts}
              onToggle={setLocalNewOfferAlerts}
            />
            <Divider style={styles.settingDivider} />
            <SettingToggle
              icon="arrow-down-bold-outline"
              label={"\u05D9\u05E8\u05D9\u05D3\u05D5\u05EA \u05DE\u05D7\u05D9\u05E8"}
              description={
                "\u05D4\u05EA\u05E8\u05D0\u05D4 \u05DB\u05E9\u05DE\u05D7\u05D9\u05E8 \u05D9\u05D5\u05E8\u05D3 \u05D1\u05D4\u05E6\u05E2\u05D5\u05EA \u05E9\u05DC\u05DA"
              }
              value={localPriceDropAlerts}
              onToggle={setLocalPriceDropAlerts}
            />
            <Divider style={styles.settingDivider} />
            <SettingToggle
              icon="chat-outline"
              label={"\u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E6'\u05D0\u05D8"}
              description={
                "\u05D4\u05EA\u05E8\u05D0\u05D5\u05EA \u05E2\u05DC \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05D7\u05D3\u05E9\u05D5\u05EA \u05D1\u05E6'\u05D0\u05D8"
              }
              value={localChatNotifications}
              onToggle={setLocalChatNotifications}
            />
          </View>
        </Section>

        {/* ---- Language Selector ---- */}
        <Section
          title={"\u05E9\u05E4\u05D4"}
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
              {"\u05EA\u05E0\u05D0\u05D9 \u05E9\u05D9\u05DE\u05D5\u05E9 \u05D5\u05DE\u05D3\u05D9\u05E0\u05D9\u05D5\u05EA \u05E4\u05E8\u05D8\u05D9\u05D5\u05EA"}
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
          {"\u05D4\u05EA\u05E0\u05EA\u05E7\u05D5\u05EA"}
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
});
