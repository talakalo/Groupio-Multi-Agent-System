import type { Contractor } from "@groupio/types";
import { Stack, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, View } from "react-native";
import {
  ActivityIndicator,
  Avatar,
  Card,
  Chip,
  HelperText,
  Searchbar,
  Text,
  useTheme,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";

import { ApiError, getContractors } from "../lib/api";
import i18n from "../lib/i18n";


/**
 * Mobile contractor browse — parity with apps/web/app/(resident)/contractors.
 *
 * Tapping a row pushes /contractor-detail?id=... where the reviews list is
 * rendered. Search filters client-side (the underlying endpoint already
 * paginates and is paginated again by category/region filters that the web
 * version exposes; for the first mobile cut we ship list + search).
 */
export default function ContractorsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [items, setItems] = useState<Contractor[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await getContractors();
      setItems((data.data ?? []) as Contractor[]);
    } catch (err: unknown) {
      setError(
        err instanceof ApiError
          ? err.message
          : i18n.t("contractors.loadFailed") || "Failed to load contractors",
      );
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await load();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  async function onRefresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  const filtered = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (c) =>
        c.businessName?.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        c.categories?.some((cat:string) => cat.toLowerCase().includes(q)),
    );
  }, [items, query]);

  if (loading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
      >
        <Stack.Screen
          options={{ title: i18n.t("contractors.title") || "Contractors" }}
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
        options={{ title: i18n.t("contractors.title") || "Contractors" }}
      />
      <View style={styles.searchWrap}>
        <Searchbar
          placeholder={
            i18n.t("contractors.searchPlaceholder") || "Search contractors"
          }
          value={query}
          onChangeText={setQuery}
          testID="contractors-search"
        />
      </View>
      {error ? (
        <HelperText type="error" visible style={styles.error}>
          {error}
        </HelperText>
      ) : null}
      <FlatList
        data={filtered}
        keyExtractor={(c) => c.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        renderItem={({ item }) => (
          <Card
            mode="outlined"
            style={styles.row}
            onPress={() => router.push({ pathname: "/contractor-detail", params: { id: item.id } })}
            testID={`contractor-row-${item.id}`}
          >
            <Card.Content>
              <View style={styles.headRow}>
                <Avatar.Text
                  size={40}
                  label={(item.businessName ?? "?").slice(0, 2).toUpperCase()}
                  style={{ backgroundColor: theme.colors.primaryContainer }}
                />
                <View style={styles.headText}>
                  <Text variant="titleMedium" numberOfLines={1}>
                    {item.businessName ?? "—"}
                  </Text>
                  <Text variant="bodySmall" style={styles.muted} numberOfLines={1}>
                    {item.description ?? ""}
                  </Text>
                </View>
              </View>
              {item.categories && item.categories.length > 0 ? (
                <View style={styles.chipRow}>
                  {item.categories.slice(0, 4).map((c) => (
                    <Chip key={c} compact style={styles.chip}>
                      {i18n.t(`categories.${c}`) || c}
                    </Chip>
                  ))}
                </View>
              ) : null}
            </Card.Content>
          </Card>
        )}
        ListEmptyComponent={
          !error ? (
            <View style={styles.emptyWrap}>
              <Text style={styles.muted}>
                {i18n.t("contractors.empty") || "No contractors match your search."}
              </Text>
            </View>
          ) : null
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  searchWrap: { padding: 16, paddingBottom: 8 },
  list: { padding: 16, paddingBottom: 32 },
  row: { marginBottom: 8 },
  headRow: { flexDirection: "row", alignItems: "center" },
  headText: { flex: 1, marginStart: 12 },
  muted: { opacity: 0.6, marginTop: 4 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 8 },
  chip: { marginEnd: 6, marginBottom: 4 },
  emptyWrap: { padding: 24, alignItems: "center" },
  error: { textAlign: "center" },
});
