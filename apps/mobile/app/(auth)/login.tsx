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
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

import { login } from "../../lib/api";
import i18n from "../../lib/i18n";

export default function LoginScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleLogin() {
    setError(null);
    if (!email.trim() || !password) {
      setError(i18n.t("auth.emailRequired"));
      return;
    }

    setLoading(true);
    try {
      await login({ email: email.trim().toLowerCase(), password });
      router.replace("/(tabs)");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : i18n.t("auth.loginFailed");
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
              variant="headlineMedium"
              style={[styles.title, { color: theme.colors.primary }]}
            >
              Groupio
            </Text>
            <Text
              variant="titleMedium"
              style={[
                styles.subtitle,
                { color: theme.colors.onSurfaceVariant },
              ]}
            >
              {i18n.t("auth.loginTitle")}
            </Text>

            <TextInput
              label={i18n.t("auth.email")}
              mode="outlined"
              value={email}
              onChangeText={(t) => {
                setEmail(t);
                setError(null);
              }}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              returnKeyType="next"
              style={styles.input}
              right={<TextInput.Icon icon="email" />}
            />

            <TextInput
              label={i18n.t("auth.password")}
              mode="outlined"
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setError(null);
              }}
              secureTextEntry={!showPassword}
              autoComplete="password"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              style={styles.input}
              right={
                <TextInput.Icon
                  icon={showPassword ? "eye-off" : "eye"}
                  onPress={() => setShowPassword((p) => !p)}
                />
              }
            />

            {error && (
              <View
                style={[
                  styles.errorBanner,
                  { backgroundColor: theme.colors.errorContainer },
                ]}
              >
                <Icon
                  name="alert-circle"
                  size={18}
                  color={theme.colors.error}
                />
                <Text
                  variant="bodySmall"
                  style={{
                    color: theme.colors.error,
                    flex: 1,
                    marginStart: 8,
                  }}
                >
                  {error}
                </Text>
              </View>
            )}

            <Button
              mode="text"
              compact
              style={styles.forgotLink}
              onPress={() => {
                /* TODO: forgot password flow */
              }}
            >
              {i18n.t("auth.forgotPassword")}
            </Button>

            <Button
              mode="contained"
              onPress={handleLogin}
              loading={loading}
              disabled={loading}
              style={styles.submitButton}
              contentStyle={styles.submitContent}
              labelStyle={styles.submitLabel}
            >
              {i18n.t("auth.loginSubmit")}
            </Button>

            <View style={styles.signupRow}>
              <Text
                variant="bodyMedium"
                style={{ color: theme.colors.onSurfaceVariant }}
              >
                {i18n.t("auth.noAccount")}
              </Text>
              <Button
                mode="text"
                compact
                onPress={() => router.push("/(auth)/signup")}
              >
                {i18n.t("auth.signup")}
              </Button>
            </View>
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
    padding: 28,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  title: {
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 4,
  },
  subtitle: {
    textAlign: "center",
    marginBottom: 24,
  },
  input: {
    marginBottom: 12,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    marginTop: 4,
    marginBottom: 4,
  },
  forgotLink: {
    alignSelf: "flex-start",
    marginBottom: 4,
  },
  submitButton: {
    marginTop: 8,
    borderRadius: 12,
  },
  submitContent: {
    height: 48,
  },
  submitLabel: {
    fontSize: 16,
    fontWeight: "700",
  },
  signupRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
  },
});
