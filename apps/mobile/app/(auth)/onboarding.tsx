import { Stack, useRouter } from "expo-router";
import React, { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  Button,
  Chip,
  HelperText,
  ProgressBar,
  RadioButton,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  ApiError,
  NormalizedAddress,
  normalizeAddress,
  submitOnboarding,
} from "../../lib/api";
import i18n from "../../lib/i18n";

/**
 * Mobile post-signup onboarding wizard.
 *
 * Mirrors apps/web/app/(auth)/onboarding/page.tsx — pick role → resident
 * collects address (with optional data.gov.il enrichment) → contractor
 * collects business profile → submit.
 */

type Step = "role" | "resident" | "contractor" | "review";
type Role = "resident" | "contractor";

const CATEGORIES = [
  "ac_installation",
  "kitchen",
  "electrical",
  "plumbing",
  "painting",
  "flooring",
  "windows",
  "security",
] as const;

export default function OnboardingScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [step, setStep] = useState<Step>("role");
  const [role, setRole] = useState<Role>("resident");
  const [resident, setResident] = useState({
    buildingAddress: "",
    city: "",
    apartmentNumber: "",
    municipalityName: undefined as string | undefined,
    addressNormalized: undefined as string | undefined,
    enrichmentConfidence: undefined as number | undefined,
    enrichmentSource: undefined as string | undefined,
  });
  const [contractor, setContractor] = useState({
    businessName: "",
    licenseNumber: "",
    yearsInBusiness: "",
    description: "",
  });
  const [categories, setCategories] = useState<Set<string>>(new Set());
  const [suggestion, setSuggestion] = useState<NormalizedAddress | null>(null);
  const [normalizing, setNormalizing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function suggestAddress() {
    setError(null);
    if (!resident.buildingAddress.trim() || !resident.city.trim()) return;
    setNormalizing(true);
    try {
      const data = await normalizeAddress(
        resident.buildingAddress.trim(),
        resident.city.trim(),
      );
      // Only show stub-confidence suggestions to the user — the backend
      // already returns confidence=0 from the offline fallback.
      if (data && data.confidence >= 0.5) {
        setSuggestion(data);
      } else {
        setSuggestion(null);
      }
    } catch (err: unknown) {
      // Enrichment is best-effort — don't block onboarding on a failure.
      setSuggestion(null);
      if (err instanceof ApiError && err.status >= 500) {
        setError(
          i18n.t("onboarding.enrichmentDown") || "Address lookup unavailable",
        );
      }
    } finally {
      setNormalizing(false);
    }
  }

  function applySuggestion() {
    if (!suggestion) return;
    setResident((r) => ({
      ...r,
      buildingAddress: suggestion.address,
      city: suggestion.city,
      municipalityName: suggestion.municipality ?? undefined,
      addressNormalized: suggestion.address,
      enrichmentConfidence: suggestion.confidence,
      enrichmentSource: suggestion.source,
    }));
    setSuggestion(null);
  }

  function toggleCategory(c: string) {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  async function handleSubmit() {
    setError(null);
    setSubmitting(true);
    try {
      const buildingPayload =
        role === "resident"
          ? {
              buildingAddress: resident.buildingAddress,
              city: resident.city,
              apartmentNumber: resident.apartmentNumber,
              ...(resident.municipalityName
                ? { municipalityName: resident.municipalityName }
                : {}),
              ...(resident.addressNormalized
                ? { addressNormalized: resident.addressNormalized }
                : {}),
              ...(resident.enrichmentConfidence != null
                ? { enrichmentConfidence: resident.enrichmentConfidence }
                : {}),
              ...(resident.enrichmentSource
                ? { enrichmentSource: resident.enrichmentSource }
                : {}),
            }
          : undefined;
      const businessPayload =
        role === "contractor"
          ? {
              businessName: contractor.businessName,
              licenseNumber: contractor.licenseNumber || undefined,
              yearsInBusiness: contractor.yearsInBusiness
                ? Number(contractor.yearsInBusiness)
                : undefined,
              description: contractor.description || undefined,
            }
          : undefined;

      await submitOnboarding({
        role,
        categories: Array.from(categories),
        ...(buildingPayload ? { building: buildingPayload } : {}),
        ...(businessPayload ? { business: businessPayload } : {}),
      });

      router.replace(role === "contractor" ? "/(tabs)" : "/(tabs)");
    } catch (err: unknown) {
      setError(
        err instanceof ApiError
          ? err.message
          : i18n.t("onboarding.submitFailed") || "Onboarding failed",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const progress =
    step === "role"
      ? 0.25
      : step === "resident" || step === "contractor"
        ? 0.6
        : 0.9;

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <Stack.Screen
        options={{ title: i18n.t("onboarding.title") || "Welcome" }}
      />
      <ProgressBar progress={progress} style={styles.progress} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {step === "role" ? (
          <View>
            <Text variant="headlineSmall" style={styles.heading}>
              {i18n.t("onboarding.roleTitle") || "How will you use Groupio?"}
            </Text>
            <RadioButton.Group
              value={role}
              onValueChange={(v) => setRole(v as Role)}
            >
              <RadioButton.Item
                label={i18n.t("onboarding.roleResident") || "I'm a resident"}
                value="resident"
                testID="onboarding-role-resident"
              />
              <RadioButton.Item
                label={i18n.t("onboarding.roleContractor") || "I'm a contractor"}
                value="contractor"
                testID="onboarding-role-contractor"
              />
            </RadioButton.Group>
            <Button
              mode="contained"
              onPress={() => setStep(role === "resident" ? "resident" : "contractor")}
              style={styles.action}
              testID="onboarding-role-next"
            >
              {i18n.t("common.next") || "Next"}
            </Button>
          </View>
        ) : null}

        {step === "resident" ? (
          <View>
            <Text variant="headlineSmall" style={styles.heading}>
              {i18n.t("onboarding.residentTitle") || "Where do you live?"}
            </Text>
            <TextInput
              label={i18n.t("onboarding.address") || "Building address"}
              value={resident.buildingAddress}
              onChangeText={(v) =>
                setResident((r) => ({ ...r, buildingAddress: v }))
              }
              onBlur={suggestAddress}
              style={styles.input}
              testID="onboarding-resident-address"
            />
            <TextInput
              label={i18n.t("onboarding.city") || "City"}
              value={resident.city}
              onChangeText={(v) => setResident((r) => ({ ...r, city: v }))}
              onBlur={suggestAddress}
              style={styles.input}
              testID="onboarding-resident-city"
            />
            <TextInput
              label={i18n.t("onboarding.apartment") || "Apartment number"}
              value={resident.apartmentNumber}
              onChangeText={(v) =>
                setResident((r) => ({ ...r, apartmentNumber: v }))
              }
              style={styles.input}
            />
            {normalizing ? (
              <Text style={styles.muted}>
                {i18n.t("onboarding.normalizing") || "Looking up address…"}
              </Text>
            ) : null}
            {suggestion ? (
              <View style={styles.suggestionBox}>
                <Text variant="labelSmall" style={styles.muted}>
                  {i18n.t("onboarding.suggestionLabel") || "We found:"}
                </Text>
                <Text>{suggestion.address}, {suggestion.city}</Text>
                {suggestion.municipality ? (
                  <Text style={styles.muted}>{suggestion.municipality}</Text>
                ) : null}
                <View style={styles.suggestionActions}>
                  <Button mode="contained" compact onPress={applySuggestion}>
                    {i18n.t("onboarding.applySuggestion") || "Use this"}
                  </Button>
                  <Button
                    mode="text"
                    compact
                    onPress={() => setSuggestion(null)}
                  >
                    {i18n.t("common.cancel") || "Cancel"}
                  </Button>
                </View>
              </View>
            ) : null}
            <View style={styles.navRow}>
              <Button mode="text" onPress={() => setStep("role")}>
                {i18n.t("common.back") || "Back"}
              </Button>
              <Button
                mode="contained"
                onPress={() => setStep("review")}
                disabled={
                  !resident.buildingAddress.trim() || !resident.city.trim()
                }
                testID="onboarding-resident-next"
              >
                {i18n.t("common.next") || "Next"}
              </Button>
            </View>
          </View>
        ) : null}

        {step === "contractor" ? (
          <View>
            <Text variant="headlineSmall" style={styles.heading}>
              {i18n.t("onboarding.contractorTitle") || "About your business"}
            </Text>
            <TextInput
              label={i18n.t("contractor.businessName") || "Business name"}
              value={contractor.businessName}
              onChangeText={(v) =>
                setContractor((c) => ({ ...c, businessName: v }))
              }
              style={styles.input}
              testID="onboarding-contractor-business-name"
            />
            <TextInput
              label={i18n.t("contractor.licenseNumber") || "License number"}
              value={contractor.licenseNumber}
              onChangeText={(v) =>
                setContractor((c) => ({ ...c, licenseNumber: v }))
              }
              style={styles.input}
            />
            <TextInput
              label={i18n.t("contractor.yearsInBusiness") || "Years in business"}
              value={contractor.yearsInBusiness}
              onChangeText={(v) =>
                setContractor((c) => ({ ...c, yearsInBusiness: v }))
              }
              inputMode="numeric"
              style={styles.input}
            />
            <TextInput
              label={i18n.t("contractor.description") || "About the business"}
              value={contractor.description}
              onChangeText={(v) =>
                setContractor((c) => ({ ...c, description: v }))
              }
              multiline
              numberOfLines={4}
              style={styles.input}
            />
            <Text variant="labelLarge" style={styles.heading}>
              {i18n.t("onboarding.categoriesTitle") || "Categories you serve"}
            </Text>
            <View style={styles.chipRow}>
              {CATEGORIES.map((c) => (
                <Chip
                  key={c}
                  selected={categories.has(c)}
                  onPress={() => toggleCategory(c)}
                  style={styles.chip}
                  testID={`onboarding-category-${c}`}
                >
                  {i18n.t(`categories.${c}`) || c}
                </Chip>
              ))}
            </View>
            <View style={styles.navRow}>
              <Button mode="text" onPress={() => setStep("role")}>
                {i18n.t("common.back") || "Back"}
              </Button>
              <Button
                mode="contained"
                onPress={() => setStep("review")}
                disabled={!contractor.businessName.trim()}
                testID="onboarding-contractor-next"
              >
                {i18n.t("common.next") || "Next"}
              </Button>
            </View>
          </View>
        ) : null}

        {step === "review" ? (
          <View>
            <Text variant="headlineSmall" style={styles.heading}>
              {i18n.t("onboarding.reviewTitle") || "Looks good?"}
            </Text>
            <Text style={styles.muted}>
              {i18n.t("onboarding.reviewBody") ||
                "Submit to finish onboarding. You can edit details later from your profile."}
            </Text>
            {error ? (
              <HelperText type="error" visible style={styles.error}>
                {error}
              </HelperText>
            ) : null}
            <View style={styles.navRow}>
              <Button
                mode="text"
                onPress={() => setStep(role === "resident" ? "resident" : "contractor")}
              >
                {i18n.t("common.back") || "Back"}
              </Button>
              <Button
                mode="contained"
                onPress={handleSubmit}
                loading={submitting}
                disabled={submitting}
                testID="onboarding-submit"
              >
                {i18n.t("onboarding.finish") || "Finish"}
              </Button>
            </View>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  progress: { height: 3 },
  scroll: { padding: 16, paddingBottom: 40 },
  heading: { marginBottom: 12 },
  input: { marginBottom: 12 },
  action: { marginTop: 16 },
  muted: { opacity: 0.7, marginBottom: 12 },
  navRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 16,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: { marginEnd: 6, marginBottom: 6 },
  suggestionBox: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.04)",
    marginBottom: 12,
  },
  suggestionActions: { flexDirection: "row", gap: 8, marginTop: 8 },
  error: { textAlign: "center" },
});
