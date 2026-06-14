import * as DocumentPicker from "expo-document-picker";
import { Stack } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  Card,
  Chip,
  HelperText,
  ProgressBar,
  Text,
  useTheme,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

import {
  ApiError,
  FileUploadStatus,
  getFileUpload,
  getProfile,
  uploadArchitecturePlan,
} from "../lib/api";
import i18n from "../lib/i18n";

/**
 * Mobile architecture-plan upload + AI analysis polling.
 *
 * Mirrors the web /architecture page: pick a PDF/image, upload it, then
 * poll `/uploads/{id}` until analysis_status leaves `pending`. Surfaces
 * the analysis result when ready.
 */

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 90_000;

export default function ArchitectureScreen() {
  const theme = useTheme();
  const [buildingId, setBuildingId] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upload, setUpload] = useState<FileUploadStatus | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = (await getProfile()) as unknown as Record<string, unknown> & {
          building_id?: string;
          buildingId?: string;
        };
        const bid = me.building_id ?? me.buildingId;
        if (!cancelled && typeof bid === "string") setBuildingId(bid);
      } catch {
        // Non-fatal — building_id is optional on the upload endpoint.
      }
    })();
    return () => {
      cancelled = true;
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, []);

  function pollFor(fileId: string) {
    setPolling(true);
    const startedAt = Date.now();
    const tick = async () => {
      try {
        const status = await getFileUpload(fileId);
        setUpload(status);
        if (
          status.analysis_status &&
          status.analysis_status !== "pending" &&
          status.analysis_status !== "processing"
        ) {
          setPolling(false);
          return;
        }
      } catch (err: unknown) {
        // Tolerate transient errors during polling — don't reset progress.
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          setPolling(false);
          setError(
            err instanceof ApiError
              ? err.message
              : i18n.t("architecture.timeout") || "Analysis timed out",
          );
          return;
        }
      }
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        setPolling(false);
        setError(i18n.t("architecture.timeout") || "Analysis timed out");
        return;
      }
      pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS);
    };
    pollTimer.current = setTimeout(tick, POLL_INTERVAL_MS);
  }

  async function pickAndUpload() {
    setError(null);
    setPicking(true);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*"],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.length) {
        setPicking(false);
        return;
      }
      const asset = res.assets[0];
      setPicking(false);
      setUploading(true);
      const uploaded = await uploadArchitecturePlan(
        asset.uri,
        buildingId ?? undefined,
      );
      setUploading(false);
      setUpload({
        id: uploaded.id,
        filename: uploaded.filename,
        status: uploaded.status,
        analysis_status: uploaded.analysis_status,
        created_at: uploaded.created_at,
      });
      // Kick off polling regardless — pending status flows through here.
      pollFor(uploaded.id);
    } catch (err: unknown) {
      setPicking(false);
      setUploading(false);
      setError(
        err instanceof ApiError
          ? err.message
          : i18n.t("architecture.uploadFailed") || "Upload failed",
      );
    }
  }

  const status = upload?.analysis_status;
  const isReady = status && status !== "pending" && status !== "processing";

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <Stack.Screen
        options={{ title: i18n.t("architecture.title") || "Architecture plan" }}
      />
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text variant="titleMedium" style={styles.heading}>
          {i18n.t("architecture.intro") || "Upload a building plan"}
        </Text>
        <Text style={styles.muted}>
          {i18n.t("architecture.body") ||
            "PDF or image. Our agent will extract floors, units, and shared spaces and suggest community-led offers."}
        </Text>

        <Button
          mode="contained"
          icon="upload"
          onPress={pickAndUpload}
          loading={picking || uploading}
          disabled={picking || uploading || polling}
          style={styles.action}
          testID="architecture-upload-cta"
        >
          {uploading
            ? i18n.t("architecture.uploadingCta") || "Uploading…"
            : i18n.t("architecture.uploadCta") || "Pick a file"}
        </Button>

        {error ? (
          <HelperText type="error" visible style={styles.error}>
            {error}
          </HelperText>
        ) : null}

        {upload ? (
          <Card mode="outlined" style={styles.statusCard} testID="architecture-status-card">
            <Card.Content>
              <View style={styles.statusHead}>
                <Icon
                  name={
                    status === "done"
                      ? "check-circle"
                      : status === "failed"
                        ? "alert-circle"
                        : "progress-clock"
                  }
                  size={24}
                  color={
                    status === "done"
                      ? theme.colors.tertiary
                      : status === "failed"
                        ? theme.colors.error
                        : theme.colors.primary
                  }
                />
                <Text variant="titleSmall" style={styles.statusLabel}>
                  {i18n.t(`architecture.status.${status}`) || status}
                </Text>
                <Chip compact mode="flat" style={styles.idChip}>
                  {upload.id.slice(0, 8)}
                </Chip>
              </View>
              {polling && !isReady ? (
                <View style={styles.progressWrap}>
                  <ProgressBar indeterminate />
                  <Text style={styles.muted}>
                    {i18n.t("architecture.polling") ||
                      "Analyzing plan — this usually takes under a minute."}
                  </Text>
                </View>
              ) : null}
              {isReady && upload.analysis_result ? (
                <View style={styles.resultWrap}>
                  <Text variant="labelLarge" style={styles.resultTitle}>
                    {i18n.t("architecture.resultTitle") || "Analysis result"}
                  </Text>
                  <Text style={styles.resultBody}>
                    {typeof upload.analysis_result === "string"
                      ? upload.analysis_result
                      : JSON.stringify(upload.analysis_result, null, 2)}
                  </Text>
                </View>
              ) : null}
              {isReady && status === "failed" ? (
                <Text style={styles.error}>
                  {i18n.t("architecture.analysisFailed") ||
                    "Analysis failed — try a clearer plan or contact support."}
                </Text>
              ) : null}
            </Card.Content>
          </Card>
        ) : null}

        {polling ? <ActivityIndicator style={styles.spinner} /> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { padding: 16, paddingBottom: 32 },
  heading: { fontWeight: "600", marginBottom: 8 },
  muted: { opacity: 0.7, marginBottom: 12 },
  action: { marginTop: 8 },
  statusCard: { marginTop: 16 },
  statusHead: { flexDirection: "row", alignItems: "center" },
  statusLabel: { marginStart: 8, flex: 1, fontWeight: "600" },
  idChip: { alignSelf: "flex-start" },
  progressWrap: { marginTop: 12, gap: 8 },
  resultWrap: { marginTop: 12 },
  resultTitle: { marginBottom: 4 },
  resultBody: { fontFamily: "monospace", fontSize: 12 },
  error: { textAlign: "center" },
  spinner: { marginTop: 16 },
});
