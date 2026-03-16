import React, { useState } from "react";
import {
  View,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  I18nManager,
} from "react-native";
import {
  Text,
  TextInput,
  Button,
  useTheme,
  HelperText,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

import { signup } from "../../lib/api";
import i18n from "../../lib/i18n";

type UserRole = "resident" | "contractor";

interface FormErrors {
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  role?: string;
}

function validateForm(
  fullName: string,
  email: string,
  password: string,
  confirmPassword: string,
  role: UserRole | null,
): FormErrors {
  const errors: FormErrors = {};
  if (!fullName.trim()) errors.fullName = i18n.t("auth.nameRequired");
  if (!email.trim()) errors.email = i18n.t("auth.emailRequired");
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    errors.email = i18n.t("auth.emailInvalid");
  if (!password) errors.password = i18n.t("auth.passwordRequired");
  else if (password.length < 8)
    errors.password = i18n.t("auth.passwordMinLength");
  if (password !== confirmPassword)
    errors.confirmPassword = i18n.t("auth.passwordMismatch");
  if (!role) errors.role = i18n.t("auth.roleRequired");
  return errors;
}

function getRoles(): { value: UserRole; icon: string; title: string; desc: string }[] {
  return [
    {
      value: "resident",
      icon: "home-account",
      title: i18n.t("auth.resident"),
      desc: i18n.t("auth.residentDesc"),
    },
    {
      value: "contractor",
      icon: "account-hard-hat",
      title: i18n.t("auth.contractorRole"),
      desc: i18n.t("auth.contractorDesc"),
    },
  ];
}

export default function SignupScreen() {
  const theme = useTheme();
  const router = useRouter();

  const [role, setRole] = useState<UserRole | null>(null);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);

  async function handleSignup() {
    setServerError(null);
    const formErrors = validateForm(fullName, email, password, confirmPassword, role);
    setErrors(formErrors);
    if (Object.keys(formErrors).length > 0) return;

    setLoading(true);
    try {
      const result = await signup({
        fullName: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        role: role!,
      });

      if (result.requiresVerification) {
        router.push({
          pathname: "/(auth)/verify-email",
          params: { email: email.trim().toLowerCase() },
        });
      } else {
        router.replace("/(auth)/login");
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : i18n.t("auth.signupFailed");
      setServerError(message);
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
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text
            variant="headlineMedium"
            style={[styles.title, { color: theme.colors.primary }]}
          >
            Groupio
          </Text>
          <Text
            variant="titleMedium"
            style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
          >
            {i18n.t("auth.signupTitle")}
          </Text>

          {/* Role selection cards */}
          <Text
            variant="labelLarge"
            style={[styles.sectionLabel, { color: theme.colors.onSurface }]}
          >
            {i18n.t("auth.accountType")}
          </Text>
          <View style={styles.roleRow}>
            {getRoles().map((r) => {
              const selected = role === r.value;
              return (
                <Pressable
                  key={r.value}
                  style={[
                    styles.roleCard,
                    {
                      backgroundColor: selected
                        ? theme.colors.primaryContainer
                        : theme.colors.surface,
                      borderColor: selected
                        ? theme.colors.primary
                        : theme.colors.outlineVariant,
                    },
                  ]}
                  onPress={() => {
                    setRole(r.value);
                    setErrors((prev) => ({ ...prev, role: undefined }));
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                >
                  <Icon
                    name={r.icon}
                    size={32}
                    color={
                      selected
                        ? theme.colors.primary
                        : theme.colors.onSurfaceVariant
                    }
                  />
                  <Text
                    variant="titleSmall"
                    style={{
                      color: selected
                        ? theme.colors.primary
                        : theme.colors.onSurface,
                      fontWeight: "700",
                      marginTop: 8,
                    }}
                  >
                    {r.title}
                  </Text>
                  <Text
                    variant="bodySmall"
                    style={{
                      color: theme.colors.onSurfaceVariant,
                      textAlign: "center",
                      marginTop: 4,
                    }}
                  >
                    {r.desc}
                  </Text>
                  {selected && (
                    <View
                      style={[
                        styles.checkBadge,
                        { backgroundColor: theme.colors.primary },
                      ]}
                    >
                      <Icon name="check" size={14} color="#fff" />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
          {errors.role && (
            <HelperText type="error" visible>
              {errors.role}
            </HelperText>
          )}

          {/* Form fields */}
          <TextInput
            label={i18n.t("auth.fullName")}
            mode="outlined"
            value={fullName}
            onChangeText={(t) => {
              setFullName(t);
              setErrors((prev) => ({ ...prev, fullName: undefined }));
            }}
            error={!!errors.fullName}
            autoCapitalize="words"
            textContentType="name"
            style={styles.input}
            right={<TextInput.Icon icon="account" />}
          />
          {errors.fullName && (
            <HelperText type="error" visible>
              {errors.fullName}
            </HelperText>
          )}

          <TextInput
            label={i18n.t("auth.email")}
            mode="outlined"
            value={email}
            onChangeText={(t) => {
              setEmail(t);
              setErrors((prev) => ({ ...prev, email: undefined }));
            }}
            error={!!errors.email}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            style={styles.input}
            right={<TextInput.Icon icon="email" />}
          />
          {errors.email && (
            <HelperText type="error" visible>
              {errors.email}
            </HelperText>
          )}

          <TextInput
            label={i18n.t("auth.password")}
            mode="outlined"
            value={password}
            onChangeText={(t) => {
              setPassword(t);
              setErrors((prev) => ({ ...prev, password: undefined }));
            }}
            error={!!errors.password}
            secureTextEntry={!showPassword}
            autoComplete="new-password"
            textContentType="newPassword"
            style={styles.input}
            right={
              <TextInput.Icon
                icon={showPassword ? "eye-off" : "eye"}
                onPress={() => setShowPassword((p) => !p)}
              />
            }
          />
          {errors.password && (
            <HelperText type="error" visible>
              {errors.password}
            </HelperText>
          )}

          <TextInput
            label={i18n.t("auth.confirmPassword")}
            mode="outlined"
            value={confirmPassword}
            onChangeText={(t) => {
              setConfirmPassword(t);
              setErrors((prev) => ({ ...prev, confirmPassword: undefined }));
            }}
            error={!!errors.confirmPassword}
            secureTextEntry={!showPassword}
            textContentType="newPassword"
            style={styles.input}
            right={<TextInput.Icon icon="lock-check" />}
          />
          {errors.confirmPassword && (
            <HelperText type="error" visible>
              {errors.confirmPassword}
            </HelperText>
          )}

          {serverError && (
            <View
              style={[
                styles.errorBanner,
                { backgroundColor: theme.colors.errorContainer },
              ]}
            >
              <Icon name="alert-circle" size={18} color={theme.colors.error} />
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.error, flex: 1, marginStart: 8 }}
              >
                {serverError}
              </Text>
            </View>
          )}

          <Button
            mode="contained"
            onPress={handleSignup}
            loading={loading}
            disabled={loading}
            style={styles.submitButton}
            contentStyle={styles.submitContent}
            labelStyle={styles.submitLabel}
          >
            {i18n.t("auth.signupSubmit")}
          </Button>

          <View style={styles.loginLinkRow}>
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {i18n.t("auth.hasAccount")}
            </Text>
            <Button
              mode="text"
              compact
              onPress={() => router.replace("/(auth)/login")}
            >
              {i18n.t("auth.login")}
            </Button>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  flex: { flex: 1 },
  scrollContent: {
    padding: 24,
    paddingBottom: 40,
  },
  title: {
    fontWeight: "800",
    textAlign: "center",
    marginTop: 16,
  },
  subtitle: {
    textAlign: "center",
    marginBottom: 24,
    marginTop: 4,
  },
  sectionLabel: {
    fontWeight: "700",
    marginBottom: 12,
  },
  roleRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 4,
  },
  roleCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 2,
    padding: 16,
    alignItems: "center",
    position: "relative",
  },
  checkBadge: {
    position: "absolute",
    top: 8,
    right: I18nManager.isRTL ? undefined : 8,
    left: I18nManager.isRTL ? 8 : undefined,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  input: {
    marginTop: 12,
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    marginTop: 16,
  },
  submitButton: {
    marginTop: 24,
    borderRadius: 12,
  },
  submitContent: {
    height: 48,
  },
  submitLabel: {
    fontSize: 16,
    fontWeight: "700",
  },
  loginLinkRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    marginTop: 16,
  },
});
