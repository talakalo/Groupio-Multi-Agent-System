import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  ScrollView,
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
  Chip,
  Divider,
  IconButton,
  Snackbar,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import type { ServiceCategory } from "@groupio/types";

import { useCreateOffer, useProfile } from "../lib/hooks";

const CATEGORIES: { value: ServiceCategory; label: string }[] = [
  { value: "ac_installation", label: "\u05D4\u05EA\u05E7\u05E0\u05EA \u05DE\u05D6\u05D2\u05E0\u05D9\u05DD" },
  { value: "ac_maintenance", label: "\u05EA\u05D7\u05D6\u05D5\u05E7\u05EA \u05DE\u05D6\u05D2\u05E0\u05D9\u05DD" },
  { value: "kitchen", label: "\u05DE\u05D8\u05D1\u05D7\u05D9\u05DD" },
  { value: "electrical", label: "\u05D7\u05E9\u05DE\u05DC" },
  { value: "plumbing", label: "\u05D0\u05D9\u05E0\u05E1\u05D8\u05DC\u05E6\u05D9\u05D4" },
  { value: "heating", label: "\u05D7\u05D9\u05DE\u05D5\u05DD" },
  { value: "renovations", label: "\u05E9\u05D9\u05E4\u05D5\u05E6\u05D9\u05DD" },
  { value: "painting", label: "\u05E6\u05D1\u05D9\u05E2\u05D4" },
  { value: "flooring", label: "\u05E8\u05D9\u05E6\u05D5\u05E3" },
  { value: "windows", label: "\u05D7\u05DC\u05D5\u05E0\u05D5\u05EA" },
];

export default function CreateOfferScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data: profile } = useProfile();
  const buildingId = profile?.buildingId ?? "";

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<ServiceCategory | null>(null);
  const [basePrice, setBasePrice] = useState("");
  const [snackbar, setSnackbar] = useState<string | null>(null);

  const createMutation = useCreateOffer({
    onSuccess: () => {
      setSnackbar("\u05D4\u05D4\u05E6\u05E2\u05D4 \u05E0\u05D5\u05E6\u05E8\u05D4 \u05D1\u05D4\u05E6\u05DC\u05D7\u05D4!");
      setTimeout(() => router.back(), 1500);
    },
    onError: () => {
      setSnackbar("\u05DC\u05D0 \u05D4\u05E6\u05DC\u05D7\u05E0\u05D5 \u05DC\u05D9\u05E6\u05D5\u05E8 \u05D4\u05E6\u05E2\u05D4. \u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1.");
    },
  });

  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = "\u05E9\u05DD \u05D4\u05D4\u05E6\u05E2\u05D4 \u05E0\u05D3\u05E8\u05E9";
    if (!description.trim() || description.length < 10)
      e.description = "\u05EA\u05D9\u05D0\u05D5\u05E8 \u05D7\u05D9\u05D9\u05D1 \u05DC\u05D4\u05DB\u05D9\u05DC \u05DC\u05E4\u05D7\u05D5\u05EA 10 \u05EA\u05D5\u05D5\u05D9\u05DD";
    if (!category) e.category = "\u05D9\u05E9 \u05DC\u05D1\u05D7\u05D5\u05E8 \u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4";
    if (!basePrice || isNaN(Number(basePrice)) || Number(basePrice) <= 0)
      e.basePrice = "\u05DE\u05D7\u05D9\u05E8 \u05D7\u05D9\u05D9\u05D1 \u05DC\u05D4\u05D9\u05D5\u05EA \u05DE\u05E1\u05E4\u05E8 \u05D7\u05D9\u05D5\u05D1\u05D9";
    return e;
  }, [title, description, category, basePrice]);

  const isValid = Object.keys(errors).length === 0;

  const handleSubmit = useCallback(() => {
    if (!isValid || !category || !buildingId) return;

    createMutation.mutate({
      category,
      buildingId,
      contractorId: "",
      basePrice: Number(basePrice),
      tiers: [
        { min: 1, max: 5, discount: 0, price: Number(basePrice) },
        { min: 5, max: 10, discount: 10, price: Math.round(Number(basePrice) * 0.9) },
        { min: 10, max: null, discount: 20, price: Math.round(Number(basePrice) * 0.8) },
      ],
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    });
  }, [isValid, category, buildingId, basePrice, createMutation]);

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={styles.flex}
      >
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: theme.colors.outlineVariant }]}>
          <IconButton icon="arrow-right" onPress={() => router.back()} />
          <Text variant="titleLarge" style={[styles.headerTitle, { color: theme.colors.onSurface }]}>
            {"\u05D4\u05E6\u05E2\u05D4 \u05D7\u05D3\u05E9\u05D4"}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Title */}
          <TextInput
            label={"\u05E9\u05DD \u05D4\u05D4\u05E6\u05E2\u05D4"}
            value={title}
            onChangeText={setTitle}
            mode="outlined"
            style={styles.input}
            error={!!title && !!errors.title}
          />
          {title.length > 0 && errors.title && (
            <HelperText type="error">{errors.title}</HelperText>
          )}

          {/* Description */}
          <TextInput
            label={"\u05EA\u05D9\u05D0\u05D5\u05E8"}
            value={description}
            onChangeText={setDescription}
            mode="outlined"
            multiline
            numberOfLines={4}
            style={[styles.input, styles.textArea]}
            error={!!description && !!errors.description}
          />
          {description.length > 0 && errors.description && (
            <HelperText type="error">{errors.description}</HelperText>
          )}

          {/* Category */}
          <Text
            variant="titleSmall"
            style={[styles.sectionTitle, { color: theme.colors.onSurface }]}
          >
            {"\u05E7\u05D8\u05D2\u05D5\u05E8\u05D9\u05D4"}
          </Text>
          <View style={styles.categoryGrid}>
            {CATEGORIES.map((cat) => (
              <Chip
                key={cat.value}
                selected={category === cat.value}
                onPress={() => setCategory(cat.value)}
                style={[
                  styles.categoryChip,
                  category === cat.value && {
                    backgroundColor: theme.colors.primaryContainer,
                  },
                ]}
                textStyle={
                  category === cat.value
                    ? { color: theme.colors.primary, fontWeight: "700" }
                    : undefined
                }
                showSelectedCheck={false}
                icon={category === cat.value ? "check" : undefined}
              >
                {cat.label}
              </Chip>
            ))}
          </View>
          {category === null && errors.category && (
            <HelperText type="error">{errors.category}</HelperText>
          )}

          <Divider style={styles.divider} />

          {/* Base Price */}
          <TextInput
            label={"\u05DE\u05D7\u05D9\u05E8 \u05D1\u05E1\u05D9\u05E1 (\u20AA)"}
            value={basePrice}
            onChangeText={setBasePrice}
            mode="outlined"
            keyboardType="numeric"
            style={styles.input}
            left={<TextInput.Affix text="\u20AA" />}
            error={!!basePrice && !!errors.basePrice}
          />
          {basePrice.length > 0 && errors.basePrice && (
            <HelperText type="error">{errors.basePrice}</HelperText>
          )}

          {/* Price tiers preview */}
          {basePrice && Number(basePrice) > 0 && (
            <View
              style={[
                styles.tiersPreview,
                { backgroundColor: theme.colors.surfaceVariant },
              ]}
            >
              <Text
                variant="titleSmall"
                style={{ color: theme.colors.onSurface, marginBottom: 8 }}
              >
                {"\u05DE\u05D3\u05E8\u05D2\u05D5\u05EA \u05DE\u05D7\u05D9\u05E8 \u05D0\u05D5\u05D8\u05D5\u05DE\u05D8\u05D9\u05D5\u05EA"}
              </Text>
              {[
                { label: "1-4 \u05DE\u05E9\u05EA\u05EA\u05E4\u05D9\u05DD", discount: 0 },
                { label: "5-9 \u05DE\u05E9\u05EA\u05EA\u05E4\u05D9\u05DD", discount: 10 },
                { label: "10+ \u05DE\u05E9\u05EA\u05EA\u05E4\u05D9\u05DD", discount: 20 },
              ].map((tier) => (
                <View key={tier.label} style={styles.tierRow}>
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    {tier.label}
                  </Text>
                  <Text
                    variant="bodySmall"
                    style={{ color: theme.colors.primary, fontWeight: "700" }}
                  >
                    {"\u20AA"}
                    {Math.round(Number(basePrice) * (1 - tier.discount / 100)).toLocaleString()}
                    {tier.discount > 0 && ` (-${tier.discount}%)`}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Submit */}
          <Button
            mode="contained"
            onPress={handleSubmit}
            disabled={!isValid || createMutation.isPending}
            loading={createMutation.isPending}
            style={styles.submitButton}
            contentStyle={styles.submitButtonContent}
            labelStyle={styles.submitButtonLabel}
            icon="check-circle"
          >
            {createMutation.isPending
              ? "\u05D9\u05D5\u05E6\u05E8 \u05D4\u05E6\u05E2\u05D4..."
              : "\u05E6\u05D5\u05E8 \u05D4\u05E6\u05E2\u05D4"}
          </Button>
        </ScrollView>
      </KeyboardAvoidingView>

      <Snackbar
        visible={!!snackbar}
        onDismiss={() => setSnackbar(null)}
        duration={3000}
        action={{ label: "\u05E1\u05D2\u05D5\u05E8", onPress: () => setSnackbar(null) }}
      >
        {snackbar ?? ""}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 4,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { flex: 1, fontWeight: "700", textAlign: "center" },
  headerSpacer: { width: 48 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  input: { marginBottom: 4 },
  textArea: { minHeight: 100 },
  sectionTitle: { fontWeight: "700", marginTop: 12, marginBottom: 8 },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  categoryChip: { marginBottom: 4 },
  divider: { marginVertical: 16 },
  tiersPreview: { borderRadius: 12, padding: 16, marginTop: 8, marginBottom: 8 },
  tierRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  submitButton: { marginTop: 24, borderRadius: 12, elevation: 0 },
  submitButtonContent: { height: 48 },
  submitButtonLabel: { fontSize: 16, fontWeight: "700" },
});
