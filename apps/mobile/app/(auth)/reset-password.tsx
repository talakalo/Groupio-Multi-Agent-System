import { useLocalSearchParams, useRouter } from "expo-router";
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

import { ApiError, confirmPasswordReset } from "../../lib/api";
import i18n from "../../lib/i18n";

/**
 * Password-reset confirmation screen.
 *
 * Reached via the email link `groupio://reset-password?token=...` (or the
 * web equivalent rewrites to this route). The token is captured from the
 * route params; the user supplies a new password twice and the screen
 * calls /auth/password/reset/confirm.
 */

export default function ResetPasswordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const initialToken = typeof params.token === "string" ? params.token : "";

  const [token, setToken] = useState(initialToken);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit() {
    setError(null);
    if (!token.trim()) {
      setError(i18n.t("auth.tokenRequired") || "Reset token is required");
      return;
    }
    if (password.length < 8) {
      setError(i18n.t("auth.passwordTooShort") || "Password must be 8+ chars");
      return;
    }
    if (password !== confirm) {
      setError(i18n.t("auth.passwordMismatch") || "Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await confirmPasswordReset(token.trim(), password);
      setSuccess(true);
    } catch (err: unknown) {
      const msg =
        err instanceof ApiError
          ? err.message
          : i18n.t("auth.resetFailed") || "Reset failed";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.center}>
          <Text variant="headlineSmall" style={styles.title}>
            {i18n.t("auth.resetSuccess") || "Password updated"}
          </Text>
          <Text style={styles.body}>
            {i18n.t("auth.resetSuccessHint") ||
              "You can now sign in with your new password."}
          </Text>
          <Button
            mode="contained"
            onPress={() => router.replace("/(auth)/login")}
            style={styles.action}
            testID="reset-password-go-login"
          >
            {i18n.t("auth.goLogin") || "Go to login"}
          </Button>
        </View>
      </SafeAreaView>
    );
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
            {i18n.t("auth.resetTitle") || "Reset password"}
          </Text>

          <TextInput
            label={i18n.t("auth.resetTokenLabel") || "Reset token"}
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            testID="reset-password-token"
          />
          <TextInput
            label={i18n.t("auth.newPassword") || "New password"}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            style={styles.input}
            testID="reset-password-new"
          />
          <TextInput
            label={i18n.t("auth.confirmPassword") || "Confirm password"}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            style={styles.input}
            testID="reset-password-confirm"
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
            testID="reset-password-submit"
          >
            {i18n.t("auth.resetCta") || "Reset password"}
          </Button>
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
