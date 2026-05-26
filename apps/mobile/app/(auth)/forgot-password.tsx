import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import {
  Text,
  TextInput,
  Button,
  useTheme,
  HelperText,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

import { requestPasswordReset, ApiError } from "../../lib/api";
import i18n from "../../lib/i18n";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit() {
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setError(i18n.t("auth.emailRequired"));
      return;
    }
    if (!EMAIL_RE.test(trimmed)) {
      setError(i18n.t("auth.emailInvalid"));
      return;
    }

    setLoading(true);
    try {
      await requestPasswordReset(trimmed);
      setSuccess(true);
    } catch (err: unknown) {
      const message =
        err instanceof ApiError
          ? err.message
          : i18n.t("auth.forgotPasswordError");
      setError(message);
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
        <View style={styles.inner}>
          <View
            style={[styles.card, { backgroundColor: theme.colors.surface }]}
          >
            <Text
              variant="headlineSmall"
              style={[styles.title, { color: theme.colors.primary }]}
            >
              {i18n.t("auth.forgotPasswordTitle")}
            </Text>
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurfaceVariant, marginBottom: 16 }}
            >
              {i18n.t("auth.forgotPasswordHint")}
            </Text>

            <TextInput
              label={i18n.t("auth.email")}
              mode="outlined"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setError(null);
                setSuccess(false);
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              style={styles.input}
              editable={!success}
            />
            <HelperText type="error" visible={!!error}>
              {error}
            </HelperText>
            <HelperText type="info" visible={success}>
              {i18n.t("auth.forgotPasswordSuccess")}
            </HelperText>

            {!success ? (
              <Button
                mode="contained"
                onPress={handleSubmit}
                loading={loading}
                disabled={loading}
                style={styles.submitButton}
              >
                {i18n.t("auth.forgotPasswordSubmit")}
              </Button>
            ) : null}

            <Button
              mode="text"
              onPress={() => router.back()}
              style={styles.back}
            >
              {i18n.t("auth.forgotPasswordBack")}
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  inner: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    borderRadius: 16,
    padding: 24,
    elevation: 2,
  },
  title: { fontWeight: "700", marginBottom: 8 },
  input: { marginBottom: 4 },
  submitButton: { marginTop: 8 },
  back: { marginTop: 8 },
});
