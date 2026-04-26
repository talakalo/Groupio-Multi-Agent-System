import { Stack, useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Avatar,
  Card,
  Chip,
  Divider,
  HelperText,
  Text,
  useTheme,
} from "react-native-paper";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  ApiError,
  ContractorProfile,
  ContractorReview,
  getContractor,
  getContractorReviews,
} from "../lib/api";
import i18n from "../lib/i18n";

/**
 * Contractor detail screen with the read-only reviews list. Mirrors the
 * web `/contractors/{id}` expanded card behaviour (web wraps it in the
 * resident contractors page, mobile gives it a dedicated route).
 */
export default function ContractorDetailScreen() {
  const theme = useTheme();
  const params = useLocalSearchParams<{ id?: string }>();
  const id = typeof params.id === "string" ? params.id : "";

  const [profile, setProfile] = useState<ContractorProfile | null>(null);
  const [reviews, setReviews] = useState<ContractorReview[] | null>(null);
  const [reviewsTotal, setReviewsTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const [p, r] = await Promise.allSettled([
          getContractor(id),
          getContractorReviews(id, { limit: 20 }),
        ]);
        if (cancelled) return;
        if (p.status === "fulfilled") setProfile(p.value);
        else setError((p.reason as Error)?.message ?? "Failed to load");
        if (r.status === "fulfilled") {
          setReviews(r.value.items);
          setReviewsTotal(r.value.total);
        } else {
          setReviews([]);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(
            err instanceof ApiError
              ? err.message
              : i18n.t("contractors.detailLoadFailed") || "Failed to load",
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!id) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <View style={styles.center}>
          <Text>Missing contractor id</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <Stack.Screen options={{ title: "" }} />
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
      <Stack.Screen options={{ title: profile?.businessName ?? "" }} />
      <ScrollView contentContainerStyle={styles.scroll}>
        {error ? (
          <HelperText type="error" visible style={styles.error}>
            {error}
          </HelperText>
        ) : null}

        {profile ? (
          <Card mode="contained" style={styles.profileCard}>
            <Card.Content>
              <View style={styles.headRow}>
                <Avatar.Text
                  size={56}
                  label={(profile.businessName ?? "?").slice(0, 2).toUpperCase()}
                  style={{ backgroundColor: theme.colors.primaryContainer }}
                />
                <View style={styles.headText}>
                  <Text variant="titleMedium">{profile.businessName ?? "—"}</Text>
                  {profile.verified ? (
                    <View style={styles.verifiedRow}>
                      <Icon
                        name="check-decagram"
                        size={16}
                        color={theme.colors.tertiary}
                      />
                      <Text variant="labelSmall" style={styles.verifiedLabel}>
                        {i18n.t("contractor.verified") || "Verified"}
                      </Text>
                    </View>
                  ) : null}
                </View>
              </View>
              {profile.description ? (
                <Text style={styles.body}>{profile.description}</Text>
              ) : null}
              {profile.categories && profile.categories.length > 0 ? (
                <View style={styles.chipRow}>
                  {profile.categories.map((c) => (
                    <Chip key={c} compact style={styles.chip}>
                      {i18n.t(`categories.${c}`) || c}
                    </Chip>
                  ))}
                </View>
              ) : null}
            </Card.Content>
          </Card>
        ) : null}

        <Text variant="titleMedium" style={styles.sectionTitle}>
          {i18n.t("contractor.reviewsHeading") || "Reviews"}
        </Text>

        {reviews === null ? (
          <ActivityIndicator />
        ) : reviews.length === 0 ? (
          <Text style={styles.muted}>
            {i18n.t("contractor.reviewsEmpty") ||
              "No reviews yet for this contractor."}
          </Text>
        ) : (
          reviews.map((r) => (
            <Card
              key={r.id}
              mode="outlined"
              style={styles.reviewRow}
              testID={`contractor-review-${r.id}`}
            >
              <Card.Content>
                <View style={styles.starsRow}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Icon
                      key={i}
                      name={i < Math.round(r.rating) ? "star" : "star-outline"}
                      size={16}
                      color={
                        i < Math.round(r.rating)
                          ? theme.colors.tertiary
                          : theme.colors.outline
                      }
                    />
                  ))}
                  <Text style={styles.reviewDate}>
                    {new Date(r.created_at).toLocaleDateString()}
                  </Text>
                </View>
                {r.comment ? (
                  <Text style={styles.reviewBody}>{r.comment}</Text>
                ) : (
                  <Text style={[styles.muted, styles.reviewBody]}>
                    {i18n.t("contractor.reviewNoComment") || "Rating only"}
                  </Text>
                )}
              </Card.Content>
            </Card>
          ))
        )}

        {reviews && reviewsTotal > reviews.length ? (
          <Text style={styles.muted}>
            {i18n.t("contractor.reviewsShowingPartial", {
              shown: reviews.length,
              total: reviewsTotal,
            }) ||
              `Showing ${reviews.length} of ${reviewsTotal} reviews`}
          </Text>
        ) : null}

        <Divider style={styles.divider} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  scroll: { padding: 16, paddingBottom: 32 },
  profileCard: { marginBottom: 16 },
  headRow: { flexDirection: "row", alignItems: "center" },
  headText: { flex: 1, marginStart: 12 },
  verifiedRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  verifiedLabel: { marginStart: 4 },
  body: { marginTop: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 8 },
  chip: { marginEnd: 6, marginBottom: 4 },
  sectionTitle: { marginBottom: 8, fontWeight: "600" },
  muted: { opacity: 0.6, marginVertical: 8 },
  reviewRow: { marginBottom: 8 },
  starsRow: { flexDirection: "row", alignItems: "center" },
  reviewDate: { marginStart: 8, opacity: 0.6, fontSize: 12 },
  reviewBody: { marginTop: 6 },
  divider: { marginVertical: 16 },
  error: { textAlign: "center" },
});
