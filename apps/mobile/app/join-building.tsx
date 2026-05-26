import { Stack, useRouter } from "expo-router";
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

import { ApiError, joinBuilding } from "../lib/api";
import i18n from "../lib/i18n";

/**
 * Resident "join a building by invite code" screen.
 *
 * Reachable from the home tab empty-state when the user has no buildingId,
 * or directly via deep link `groupio://join-building?code=ABC23456`.
 */
export default function JoinBuildingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit() {
    setError(null);
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 6) {
      setError(i18n.t("building.inviteTooShort") || "Code must be at least 6 chars");
      return;
    }
    setLoading(true);
    try {
      await joinBuilding(trimmed);
      setSuccess(true);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 404) {
          setError(
            i18n.t("building.inviteNotFound") || "No building matches this code",
          );
        } else if (err.status === 400) {
          setError(
            err.message ||
              i18n.t("building.alreadyResident") ||
              "Already a resident of this building",
          );
        } else {
          setError(err.message);
        }
      } else {
        setError(i18n.t("building.joinFailed") || "Failed to join");
      }
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <Stack.Screen
          options={{ title: i18n.t("building.joinTitle") || "Join a building" }}
        />
        <View style={styles.center}>
          <Text variant="headlineSmall" style={styles.title}>
            {i18n.t("building.joinSuccess") || "Joined!"}
          </Text>
          <Text style={styles.body}>
            {i18n.t("building.joinSuccessHint") ||
              "You can now see your building's offers and neighbors."}
          </Text>
          <Button
            mode="contained"
            onPress={() => router.replace("/(tabs)")}
            style={styles.action}
            testID="join-building-go-home"
          >
            {i18n.t("building.goToBuilding") || "Go to my building"}
          </Button>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <Stack.Screen
        options={{ title: i18n.t("building.joinTitle") || "Join a building" }}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.center}>
          <Text variant="headlineSmall" style={styles.title}>
            {i18n.t("building.joinTitle") || "Join a building"}
          </Text>
          <Text style={styles.body}>
            {i18n.t("building.joinBodyHint") ||
              "Enter the invite code your building admin sent you."}
          </Text>
          <TextInput
            label={i18n.t("building.inviteCodeLabel") || "Invite code"}
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            style={styles.input}
            testID="join-building-code"
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
            disabled={loading || code.trim().length < 6}
            style={styles.action}
            testID="join-building-submit"
          >
            {i18n.t("building.joinCta") || "Join"}
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
  title: { textAlign: "center", marginBottom: 12 },
  body: { textAlign: "center", marginBottom: 24, opacity: 0.7 },
  input: { marginBottom: 12 },
  error: { textAlign: "center" },
  action: { marginTop: 16 },
});
