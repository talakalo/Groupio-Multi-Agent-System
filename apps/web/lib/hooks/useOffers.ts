import type { Offer, OfferStatus, ServiceCategory } from '@groupio/types';
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';

import { apiClient } from '@/lib/api/client';

// ---------------------------------------------------------------------------
// Query key factory
// ---------------------------------------------------------------------------

export const offerKeys = {
  all: ['offers'] as const,
  lists: () => [...offerKeys.all, 'list'] as const,
  list: (filters: OfferFilters) => [...offerKeys.lists(), filters] as const,
  details: () => [...offerKeys.all, 'detail'] as const,
  detail: (id: string) => [...offerKeys.details(), id] as const,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OfferFilters {
  buildingId: string;
  category?: ServiceCategory;
  status?: OfferStatus;
}

interface CreateOfferPayload {
  category: ServiceCategory;
  basePrice: number;
  buildingId: string;
  tiers: {
    min: number;
    max: number | null;
    discount: number;
    price: number;
  }[];
  expiresAt: string;
}

interface JoinOfferPayload {
  offerId: string;
  unitCount?: number;
  inviteToken?: string;
}

// ---------------------------------------------------------------------------
// useOffers — fetch a filtered list of offers
// ---------------------------------------------------------------------------

export function useOffers(
  filters: OfferFilters,
  options?: Omit<
    UseQueryOptions<
      { items: Offer[]; total: number; page: number; page_size: number; has_more: boolean },
      Error
    >,
    'queryKey' | 'queryFn'
  >,
) {
  return useQuery({
    queryKey: offerKeys.list(filters),
    queryFn: () =>
      apiClient.getOffers(filters.buildingId, {
        category: filters.category,
        status: filters.status,
      }),
    enabled: Boolean(filters.buildingId),
    ...options,
  });
}

// ---------------------------------------------------------------------------
// useOffer — fetch a single offer by ID
// ---------------------------------------------------------------------------

export function useOffer(
  offerId: string | undefined,
  options?: Omit<UseQueryOptions<Offer, Error>, 'queryKey' | 'queryFn'>,
) {
  return useQuery({
    queryKey: offerKeys.detail(offerId ?? ''),
    queryFn: () => apiClient.getOffer(offerId!),
    enabled: Boolean(offerId),
    ...options,
  });
}

// ---------------------------------------------------------------------------
// useCreateOffer — mutation to create a new offer
// ---------------------------------------------------------------------------

export function useCreateOffer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateOfferPayload) => {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000'}/api/v1/offers`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );
      if (!response.ok) {
        throw new Error(`Failed to create offer: ${response.status}`);
      }
      return response.json() as Promise<Offer>;
    },
    onSuccess: (_data, variables) => {
      // Invalidate the offers list for the relevant building
      queryClient.invalidateQueries({
        queryKey: offerKeys.lists(),
      });
    },
  });
}

// ---------------------------------------------------------------------------
// useJoinOffer — mutation to join an existing group offer
// ---------------------------------------------------------------------------

export function useJoinOffer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ offerId, unitCount, inviteToken }: JoinOfferPayload) => {
      return apiClient.joinOffer(offerId, unitCount, inviteToken);
    },
    onSuccess: (_data, variables) => {
      // Optimistically update the participant count in the cache
      queryClient.invalidateQueries({
        queryKey: offerKeys.detail(variables.offerId),
      });
      queryClient.invalidateQueries({
        queryKey: offerKeys.lists(),
      });
    },
  });
}
