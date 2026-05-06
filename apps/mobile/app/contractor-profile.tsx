import { Stack, useRouter } from "expo-router";
import * as DocumentPicker from "expo-document-picker";
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  HelperText,
  Snackbar,
  Text,
  TextInput,
  useTheme,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  ApiError,
  ContractorProfile,
  getContractor,
  getProfile,
  updateContractor,
  uploadContractorDoc,
} from "../lib/api";
import i18n from "../lib/i18n";

/**
 * Mobile contractor profile editor — parity with apps/web/app/contractor/profile.
 *
 * Loads /auth/me to discover the contractor_id, fetches the full
 * contractor record, lets the contractor edit free-text fields and upload
 * documents, then PUTs the patch back.
 */

export default function ContractorProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snack, setSnack] = useState<string | null>(null);
  const [contractorId, setContractorId] = useState<string | null>(null);
  const [form, setForm] = useState<ContractorProfile>({
    id: "",
    businessName: "",
    ownerName: "",
    phone: "",
    email: "",
    description: "",
    licenseNumber: "",
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = (await getProfile()) as unknown as Record<string, unknown> & {
          contractor_id?: string;
          contractorId?: string;
        };
        const cid = me.contractor_id ?? me.contractorId ?? null;
        if (!cid) {
          setError(
            i18n.t("contractor.notLinked") ||
              "This account isn't linked to a contractor profile.",
          );
          return;
        }
        setContractorId(cid);
        const c = await getContractor(cid);
        if (cancelled) return;
        setForm({ ...c });
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : i18n.t("contractor.loadFailed") || "Failed to load profile",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    if (!contractorId) return;
    setSaving(true);
    setError(null);
    try {
      const patch: Record<string, unknown> = {};
      if (form.businessName !== undefined) patch.business_name = form.businessName;
      if (form.ownerName !== undefined) patch.owner_name = form.ownerName;
      if (form.phone !== undefined) patch.phone = form.phone;
      if (form.email !== undefined) patch.email = form.email;
      if (form.description !== undefined) patch.description = form.description;
      if (form.licenseNumber !== undefined) patch.license_number = form.licenseNumber;
      const updated = await updateContractor(contractorId, patch);
      setForm({ ...updated });
      setSnack(i18n.t("contractor.saveSuccess") || "Profile saved");
    } catch (err: unknown) {
      setError(
        err instanceof ApiError
          ? err.message
          : i18n.t("contractor.saveFailed") || "Failed to save profile",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleUploadDoc() {
    setError(null);
    setUploading(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) {
        setUploading(false);
        return;
      }
      const asset = result.assets[0];
      await uploadContractorDoc(asset.uri, asset.name);
      setSnack(i18n.t("contractor.uploadSuccess") || "Document uploaded");
    } catch (err: unknown) {
      setError(
        err instanceof ApiError
          ? err.message
          : i18n.t("contractor.uploadFailed") || "Upload failed",
      );
    } finally {
      setUploading(false);
    }
  }

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <Stack.Screen
          options={{ title: i18n.t("contractor.profileTitle") || "My business" }}
        />
        <View style={styles.center}>
          <ActivityIndicator />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <Stack.Screen
        options={{ title: i18n.t("contractor.profileTitle") || "My business" }}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text variant="titleMedium" style={styles.section}>
          {i18n.t("contractor.businessInfo") || "Business info"}
        </Text>

        <TextInput
          label={i18n.t("contractor.businessName") || "Business name"}
          value={form.businessName ?? ""}
          onChangeText={(v) => setForm((f) => ({ ...f, businessName: v }))}
          style={styles.input}
          testID="contractor-profile-business-name"
        />
        <TextInput
          label={i18n.t("contractor.ownerName") || "Owner name"}
          value={form.ownerName ?? ""}
          onChangeText={(v) => setForm((f) => ({ ...f, ownerName: v }))}
          style={styles.input}
        />
        <TextInput
          label={i18n.t("contractor.phone") || "Phone"}
          value={form.phone ?? ""}
          onChangeText={(v) => setForm((f) => ({ ...f, phone: v }))}
          inputMode="tel"
          style={styles.input}
        />
        <TextInput
          label={i18n.t("contractor.email") || "Email"}
          value={form.email ?? ""}
          onChangeText={(v) => setForm((f) => ({ ...f, email: v }))}
          inputMode="email"
          autoCapitalize="none"
          style={styles.input}
        />
        <TextInput
          label={i18n.t("contractor.licenseNumber") || "License number"}
          value={form.licenseNumber ?? ""}
          onChangeText={(v) => setForm((f) => ({ ...f, licenseNumber: v }))}
          style={styles.input}
        />
        <TextInput
          label={i18n.t("contractor.description") || "About the business"}
          value={form.description ?? ""}
          onChangeText={(v) => setForm((f) => ({ ...f, description: v }))}
          multiline
          numberOfLines={4}
          style={styles.input}
        />

        {error ? (
          <HelperText type="error" visible style={styles.error}>
            {error}
          </HelperText>
        ) : null}

        <Button
          mode="contained"
          onPress={handleSave}
          loading={saving}
          disabled={saving}
          style={styles.action}
          testID="contractor-profile-save"
        >
          {i18n.t("contractor.save") || "Save"}
        </Button>

        <Text variant="titleMedium" style={[styles.section, styles.spaceTop]}>
          {i18n.t("contractor.documents") || "Documents"}
        </Text>
        <Text style={styles.body}>
          {i18n.t("contractor.documentsHint") ||
            "Upload license, insurance, or any verification document. PDF or image."}
        </Text>
        <Button
          mode="outlined"
          icon="upload"
          onPress={handleUploadDoc}
          loading={uploading}
          disabled={uploading}
          style={styles.action}
          testID="contractor-profile-upload-doc"
        >
          {i18n.t("contractor.uploadDoc") || "Upload document"}
        </Button>
      </ScrollView>

      <Snackbar
        visible={!!snack}
        onDismiss={() => setSnack(null)}
        duration={3000}
      >
        {snack ?? ""}
      </Snackbar>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, paddingBottom: 80 },
  section: { fontWeight: "600", marginBottom: 8 },
  spaceTop: { marginTop: 24 },
  body: { opacity: 0.7, marginBottom: 12 },
  input: { marginBottom: 12 },
  error: { textAlign: "center" },
  action: { marginTop: 8 },
});
