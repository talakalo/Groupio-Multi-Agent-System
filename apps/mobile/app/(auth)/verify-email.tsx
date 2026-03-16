import { useRouter, useLocalSearchParams } from "expo-router";
import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import { Text, Button, useTheme } from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

import { resendVerification } from "../../lib/api";
import i18n from "../../lib/i18n";

export default function VerifyEmailScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { email } = useLocalSearchParams<{ email: string }>();

  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleResend() {
    if (!email) return;
    setResending(true);
    setError(null);
    try {
      await resendVerification(email);
      setResent(true);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : i18n.t("auth.resendFailed");
      setError(message);
    } finally {
      setResending(false);
    }
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <View style={styles.content}>
        <View
          style={[
            styles.iconCircle,
            { backgroundColor: theme.colors.primaryContainer },
          ]}
        >
          <Icon
            name="email-check-outline"
            size={56}
            color={theme.colors.primary}
          />
        </View>

        <Text
          variant="headlineSmall"
          style={[styles.title, { color: theme.colors.onSurface }]}
        >
          {i18n.t("auth.verifyEmailTitle")}
        </Text>

        <Text
          variant="bodyLarge"
          style={[styles.message, { color: theme.colors.onSurfaceVariant }]}
        >
          {i18n.t("auth.verifyEmailSent")}{"\n"}
          <Text style={{ fontWeight: "700", color: theme.colors.primary }}>
            {email ?? ""}
          </Text>
        </Text>

        <Text
          variant="bodyMedium"
          style={[styles.hint, { color: theme.colors.onSurfaceVariant }]}
        >
          {i18n.t("auth.verifyEmailHint")}
        </Text>

        {resent && (
          <View
            style={[
              styles.successBanner,
              { backgroundColor: theme.colors.tertiaryContainer },
            ]}
          >
            <Icon name="check-circle" size={18} color={theme.colors.tertiary} />
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.tertiary, marginStart: 8 }}
            >
              {i18n.t("auth.resendSuccess")}
            </Text>
          </View>
        )}

        {error && (
          <View
            style={[
              styles.errorBanner,
              { backgroundColor: theme.colors.errorContainer },
            ]}
          >
            <Icon name="alert-circle" size={18} color={theme.colors.error} />
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.error, marginStart: 8, flex: 1 }}
            >
              {error}
            </Text>
          </View>
        )}

        <Button
          mode="outlined"
          onPress={handleResend}
          loading={resending}
          disabled={resending}
          style={styles.resendButton}
          icon="email-sync"
        >
          {i18n.t("auth.resendVerification")}
        </Button>

        <Button
          mode="contained"
          onPress={() => router.replace("/(auth)/login")}
          style={styles.loginButton}
          contentStyle={styles.loginContent}
          labelStyle={styles.loginLabel}
          icon="login"
        >
          {i18n.t("auth.continueToLogin")}
        </Button>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
  },
  content: {
    paddingHorizontal: 32,
    alignItems: "center",
  },
  iconCircle: {
    width: 104,
    height: 104,
    borderRadius: 52,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  title: {
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 12,
  },
  message: {
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 8,
  },
  hint: {
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  successBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    alignSelf: "stretch",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    marginBottom: 16,
    alignSelf: "stretch",
  },
  resendButton: {
    borderRadius: 12,
    alignSelf: "stretch",
    marginBottom: 12,
  },
  loginButton: {
    borderRadius: 12,
    alignSelf: "stretch",
  },
  loginContent: {
    height: 48,
  },
  loginLabel: {
    fontSize: 16,
    fontWeight: "700",
  },
});
