import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from "react-native";
import {
  Button,
  HelperText,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

import { ApiError, resendVerification } from "../../lib/api";
import i18n from "../../lib/i18n";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Unauthenticated screen to request a new verification email.
 *
 * Pairs with the existing verify-email screen — when the user lands there
 * with no token (or an expired one) they can navigate here to ask for a
 * fresh email without needing to be logged in.
 */
export default function ResendVerificationScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError(i18n.t("auth.emailRequired") || "Email is required");
      return;
    }
    if (!EMAIL_RE.test(trimmed)) {
      setError(i18n.t("auth.emailInvalid") || "Invalid email address");
      return;
    }
    setLoading(true);
    try {
      await resendVerification(trimmed);
      setSent(true);
    } catch (err: unknown) {
      // The backend deliberately returns success even when the email is
      // unknown to prevent enumeration. So a real ApiError here is rare,
      // but we still surface the message if one shows up.
      const msg =
        err instanceof ApiError
          ? err.message
          : i18n.t("auth.resendFailed") || "Failed to send";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.center}>
          <Text variant="headlineSmall" style={styles.title}>
            {i18n.t("auth.resendTitle") || "Resend verification"}
          </Text>
          {sent ? (
            <>
              <Text style={styles.body}>
                {i18n.t("auth.resendSuccess") ||
                  "If that account exists, a new verification email is on its way."}
              </Text>
              <Button
                mode="contained"
                onPress={() => router.replace("/(auth)/login")}
                style={styles.action}
                testID="resend-verification-go-login"
              >
                {i18n.t("auth.goLogin") || "Go to login"}
              </Button>
            </>
          ) : (
            <>
              <TextInput
                label={i18n.t("auth.emailLabel") || "Email"}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                inputMode="email"
                style={styles.input}
                testID="resend-verification-email"
              />
              {error ? (
                <HelperText type="error" visible style={styles.error}>
                  {error}
                </HelperText>
              ) : null}
              <Button
                mode="contained"
                onPress={handleSubmit}
                loading={loading}
                disabled={loading}
                style={styles.action}
                testID="resend-verification-submit"
              >
                {i18n.t("auth.resendCta") || "Send verification email"}
              </Button>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  center: { flex: 1, justifyContent: "center", padding: 24 },
  title: { textAlign: "center", marginBottom: 24 },
  body: { textAlign: "center", marginBottom: 24, opacity: 0.7 },
  input: { marginBottom: 12 },
  error: { textAlign: "center" },
  action: { marginTop: 16 },
});
