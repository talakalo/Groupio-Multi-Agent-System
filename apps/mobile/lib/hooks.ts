import { useCallback, useRef, useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
  type UseMutationOptions,
} from "@tanstack/react-query";
import type {
  Offer,
  Contractor,
  ServiceCategory,
  MessageRequest,
  MessageResponse,
  Message,
  ContractorMatch,
} from "@groupio/types";
import {
  getOffers,
  getOffer,
  createOffer,
  joinOffer,
  getContractors,
  getContractorMatches,
  getProfile,
  updateProfile,
  sendMessage,
  sendMessageStream,
  getActivityFeed,
  getBuildingNews,
  type OffersFilters,
  type ContractorsFilters,
  type CreateOfferPayload,
  type UpdateProfilePayload,
  type PaginatedResponse,
  type ProfileResponse,
  type ActivityItem,
  type NewsItem,
  type ChatStreamEvent,
} from "./api";

// ---------------------------------------------------------------------------
// Query key factory – keeps cache keys consistent
// ---------------------------------------------------------------------------

export const queryKeys = {
  offers: {
    all: ["offers"] as const,
    list: (filters?: OffersFilters) => ["offers", "list", filters] as const,
    detail: (id: string) => ["offers", "detail", id] as const,
  },
  contractors: {
    all: ["contractors"] as const,
    list: (filters?: ContractorsFilters) =>
      ["contractors", "list", filters] as const,
    matches: (category: ServiceCategory, buildingId: string) =>
      ["contractors", "matches", category, buildingId] as const,
  },
  profile: ["profile"] as const,
  activity: (buildingId: string) => ["activity", buildingId] as const,
  news: (buildingId: string) => ["news", buildingId] as const,
} as const;

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------

/** Fetch a paginated list of offers with optional filters. */
export function useOffers(
  filters?: OffersFilters,
  options?: Omit<
    UseQueryOptions<PaginatedResponse<Offer>>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery<PaginatedResponse<Offer>>({
    queryKey: queryKeys.offers.list(filters),
    queryFn: ({ signal }) => getOffers(filters, signal),
    ...options,
  });
}

/** Fetch a single offer by ID. */
export function useOffer(
  id: string,
  options?: Omit<UseQueryOptions<Offer>, "queryKey" | "queryFn">,
) {
  return useQuery<Offer>({
    queryKey: queryKeys.offers.detail(id),
    queryFn: ({ signal }) => getOffer(id, signal),
    enabled: !!id,
    ...options,
  });
}

/** Create a new group offer (mutation). */
export function useCreateOffer(
  options?: UseMutationOptions<Offer, Error, CreateOfferPayload>,
) {
  const queryClient = useQueryClient();

  return useMutation<Offer, Error, CreateOfferPayload>({
    mutationFn: createOffer,
    onSuccess: (newOffer, variables, context) => {
      // Invalidate offer lists so they refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.offers.all });
      // Seed the detail cache
      queryClient.setQueryData(queryKeys.offers.detail(newOffer.id), newOffer);
      options?.onSuccess?.(newOffer, variables, context);
    },
    ...options,
  });
}

/** Join an existing group offer (mutation). */
export function useJoinOffer(
  options?: UseMutationOptions<
    { success: boolean; participants: number },
    Error,
    string
  >,
) {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean; participants: number }, Error, string>({
    mutationFn: joinOffer,
    onSuccess: (result, offerId, context) => {
      // Refetch the specific offer and all lists
      queryClient.invalidateQueries({
        queryKey: queryKeys.offers.detail(offerId),
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.offers.all });
      options?.onSuccess?.(result, offerId, context);
    },
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Contractors
// ---------------------------------------------------------------------------

/** Fetch contractors with optional filters. */
export function useContractors(
  filters?: ContractorsFilters,
  options?: Omit<
    UseQueryOptions<PaginatedResponse<Contractor>>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery<PaginatedResponse<Contractor>>({
    queryKey: queryKeys.contractors.list(filters),
    queryFn: ({ signal }) => getContractors(filters, signal),
    ...options,
  });
}

/** Fetch AI-matched contractors for a category + building. */
export function useContractorMatches(
  category: ServiceCategory,
  buildingId: string,
  options?: Omit<
    UseQueryOptions<ContractorMatch[]>,
    "queryKey" | "queryFn"
  >,
) {
  return useQuery<ContractorMatch[]>({
    queryKey: queryKeys.contractors.matches(category, buildingId),
    queryFn: ({ signal }) =>
      getContractorMatches(category, buildingId, signal),
    enabled: !!category && !!buildingId,
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------

/** Fetch the current user's profile. */
export function useProfile(
  options?: Omit<UseQueryOptions<ProfileResponse>, "queryKey" | "queryFn">,
) {
  return useQuery<ProfileResponse>({
    queryKey: queryKeys.profile,
    queryFn: ({ signal }) => getProfile(signal),
    ...options,
  });
}

/** Update the current user's profile (mutation). */
export function useUpdateProfile(
  options?: UseMutationOptions<ProfileResponse, Error, UpdateProfilePayload>,
) {
  const queryClient = useQueryClient();

  return useMutation<ProfileResponse, Error, UpdateProfilePayload>({
    mutationFn: updateProfile,
    onSuccess: (updated, variables, context) => {
      queryClient.setQueryData(queryKeys.profile, updated);
      options?.onSuccess?.(updated, variables, context);
    },
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Activity & News
// ---------------------------------------------------------------------------

/** Fetch the activity feed for a building. */
export function useActivityFeed(
  buildingId: string,
  limit?: number,
  options?: Omit<UseQueryOptions<ActivityItem[]>, "queryKey" | "queryFn">,
) {
  return useQuery<ActivityItem[]>({
    queryKey: queryKeys.activity(buildingId),
    queryFn: ({ signal }) => getActivityFeed(buildingId, limit, signal),
    enabled: !!buildingId,
    ...options,
  });
}

/** Fetch building news / announcements. */
export function useBuildingNews(
  buildingId: string,
  options?: Omit<UseQueryOptions<NewsItem[]>, "queryKey" | "queryFn">,
) {
  return useQuery<NewsItem[]>({
    queryKey: queryKeys.news(buildingId),
    queryFn: ({ signal }) => getBuildingNews(buildingId, signal),
    enabled: !!buildingId,
    ...options,
  });
}

// ---------------------------------------------------------------------------
// Chat – stateful hook with streaming support
// ---------------------------------------------------------------------------

export interface UseChatOptions {
  userId: string;
  buildingId?: string;
  onError?: (error: Error) => void;
}

export interface UseChatReturn {
  messages: Message[];
  isLoading: boolean;
  isStreaming: boolean;
  send: (text: string) => void;
  clearMessages: () => void;
}

/**
 * Stateful hook for the AI chat with streaming support.
 *
 * Maintains the full conversation in local state, appends user messages
 * immediately, then streams the assistant response token-by-token.
 */
export function useChat({
  userId,
  buildingId,
  onError,
}: UseChatOptions): UseChatReturn {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content:
        "\u05E9\u05DC\u05D5\u05DD! \u05D0\u05E0\u05D9 \u05D4\u05E2\u05D5\u05D6\u05E8 \u05D4\u05D7\u05DB\u05DD \u05E9\u05DC Groupio. \u05D0\u05D9\u05DA \u05D0\u05E4\u05E9\u05E8 \u05DC\u05E2\u05D6\u05D5\u05E8 \u05DC\u05DA \u05D4\u05D9\u05D5\u05DD?",
      timestamp: new Date(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (text: string) => {
      if (!text.trim() || isLoading) return;

      // Cancel any in-flight stream
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const userMessage: Message = {
        role: "user",
        content: text.trim(),
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage]);
      setIsLoading(true);
      setIsStreaming(true);

      const payload: MessageRequest = {
        userId,
        message: text.trim(),
        buildingId,
        channel: "app",
      };

      // Accumulator for streamed tokens
      let assistantContent = "";

      try {
        // Try streaming first; fall back to single request
        let usedStream = false;

        try {
          for await (const event of sendMessageStream(
            payload,
            controller.signal,
          )) {
            usedStream = true;
            if (event.type === "token") {
              assistantContent += event.content;
              setMessages((prev) => {
                const last = prev[prev.length - 1];
                if (last?.role === "assistant" && last === streamPlaceholder) {
                  return [
                    ...prev.slice(0, -1),
                    { ...last, content: assistantContent },
                  ];
                }
                return [
                  ...prev,
                  {
                    role: "assistant",
                    content: assistantContent,
                    timestamp: new Date(),
                  },
                ];
              });
            }

            if (event.type === "done") break;
            if (event.type === "error") throw new Error(event.content);
          }
        } catch (streamErr) {
          if ((streamErr as Error).name === "AbortError") return;

          // Fallback to non-streaming request
          if (!usedStream) {
            const response = await sendMessage(payload, controller.signal);
            assistantContent = response.response.message;
          } else {
            throw streamErr;
          }
        }

        if (assistantContent) {
          setMessages((prev) => {
            // Remove any partial stream placeholder and add final
            const filtered = prev.filter((m) => m !== streamPlaceholder);
            const lastMsg = filtered[filtered.length - 1];
            if (lastMsg?.role === "assistant" && lastMsg.content === assistantContent) {
              return filtered;
            }
            return [
              ...filtered,
              {
                role: "assistant",
                content: assistantContent,
                timestamp: new Date(),
              },
            ];
          });
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        onError?.(err as Error);
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "\u05DE\u05E6\u05D8\u05E2\u05E8, \u05D0\u05D9\u05E8\u05E2\u05D4 \u05E9\u05D2\u05D9\u05D0\u05D4. \u05D0\u05E0\u05D0 \u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1.",
            timestamp: new Date(),
          },
        ]);
      } finally {
        setIsLoading(false);
        setIsStreaming(false);
      }
    },
    [userId, buildingId, isLoading, onError],
  );

  const clearMessages = useCallback(() => {
    abortRef.current?.abort();
    setMessages([
      {
        role: "assistant",
        content:
          "\u05E9\u05DC\u05D5\u05DD! \u05D0\u05E0\u05D9 \u05D4\u05E2\u05D5\u05D6\u05E8 \u05D4\u05D7\u05DB\u05DD \u05E9\u05DC Groupio. \u05D0\u05D9\u05DA \u05D0\u05E4\u05E9\u05E8 \u05DC\u05E2\u05D6\u05D5\u05E8 \u05DC\u05DA \u05D4\u05D9\u05D5\u05DD?",
        timestamp: new Date(),
      },
    ]);
  }, []);

  return { messages, isLoading, isStreaming, send, clearMessages };
}

// Sentinel object used to identify the streaming placeholder message
const streamPlaceholder: Message = {
  role: "assistant",
  content: "",
  timestamp: new Date(),
};
