"use client";

/**
 * PERF-8 — shared `useApiData` hook for resident web pages.
 *
 * Thin, typed wrapper over `@tanstack/react-query`'s `useQuery` that enforces
 * a consistent cache + revalidation policy across the resident app:
 * - 60s `staleTime` matches the backend Cache-Control defaults (PERF-12).
 * - `refetchOnWindowFocus` disabled so tab switches don't thrash the API.
 * - Typed query keys so inspector/devtools stay useful.
 *
 * Why a wrapper instead of calling `useQuery` everywhere: we standardise the
 * cache policy in one place, migrate pages incrementally, and can add cross-
 * cutting behaviour (e.g. telemetry, suspense switch) without touching call
 * sites again.
 */

import { useQuery, type UseQueryResult } from "@tanstack/react-query";

export interface UseApiDataOptions {
  /** Milliseconds a cached result is considered fresh. Default: 60_000. */
  staleTime?: number;
  /** Milliseconds between background refetches. Omit to disable. */
  refetchInterval?: number;
  /** Disable the query entirely (e.g. until a prerequisite id is known). */
  enabled?: boolean;
}

export function useApiData<T>(
  queryKey: readonly unknown[],
  fetcher: () => Promise<T>,
  options: UseApiDataOptions = {},
): UseQueryResult<T> {
  return useQuery<T>({
    queryKey: queryKey as unknown[],
    queryFn: fetcher,
    staleTime: options.staleTime ?? 60_000,
    refetchInterval: options.refetchInterval,
    refetchOnWindowFocus: false,
    enabled: options.enabled,
  });
}
