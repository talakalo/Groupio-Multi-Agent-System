import { create } from 'zustand';
import type { Offer, ServiceCategory, OfferStatus } from '@groupio/types';

interface OfferFilters {
  category?: ServiceCategory;
  status?: OfferStatus;
  buildingId?: string;
  search?: string;
}

interface OfferState {
  offers: Offer[];
  currentOffer: Offer | null;
  filters: OfferFilters;
  isLoading: boolean;
  error: string | null;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    hasMore: boolean;
  };

  // Actions
  setOffers: (offers: Offer[]) => void;
  addOffer: (offer: Offer) => void;
  updateOffer: (id: string, updates: Partial<Offer>) => void;
  removeOffer: (id: string) => void;
  setCurrentOffer: (offer: Offer | null) => void;
  setFilters: (filters: Partial<OfferFilters>) => void;
  clearFilters: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setPagination: (pagination: Partial<OfferState['pagination']>) => void;

  // Async actions
  fetchOffers: (params?: { page?: number; filters?: OfferFilters }) => Promise<void>;
  fetchOffer: (id: string) => Promise<void>;
  createOffer: (data: CreateOfferData) => Promise<Offer>;
  joinOffer: (offerId: string, unitCount?: number) => Promise<void>;
  leaveOffer: (offerId: string) => Promise<void>;
}

interface CreateOfferData {
  title: string;
  description: string;
  category: ServiceCategory;
  basePrice: number;
  minParticipants: number;
  maxParticipants: number;
  buildingId: string;
  deadline?: string;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const getAuthHeader = (): Record<string, string> => {
  // Get token from auth store
  const authData = typeof window !== 'undefined' ? localStorage.getItem('groupio-auth') : null;
  if (authData) {
    const { state } = JSON.parse(authData);
    if (state?.accessToken) {
      return { Authorization: `Bearer ${state.accessToken}` };
    }
  }
  return {};
};

export const useOfferStore = create<OfferState>((set, get) => ({
  offers: [],
  currentOffer: null,
  filters: {},
  isLoading: false,
  error: null,
  pagination: {
    page: 1,
    pageSize: 20,
    total: 0,
    hasMore: false,
  },

  setOffers: (offers) => set({ offers }),

  addOffer: (offer: Offer) =>
    set((state) => ({
      offers: [offer, ...state.offers],
    })),

  updateOffer: (id, updates) =>
    set((state) => ({
      offers: state.offers.map((o: Offer) =>
        o.id === id ? { ...o, ...updates } : o
      ),
      currentOffer:
        state.currentOffer?.id === id
          ? { ...state.currentOffer, ...updates }
          : state.currentOffer,
    })),

  removeOffer: (id) =>
    set((state) => ({
      offers: state.offers.filter((o) => o.id !== id),
      currentOffer:
        state.currentOffer?.id === id ? null : state.currentOffer,
    })),

  setCurrentOffer: (currentOffer) => set({ currentOffer }),

  setFilters: (filters) =>
    set((state) => ({
      filters: { ...state.filters, ...filters },
    })),

  clearFilters: () => set({ filters: {} }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  setPagination: (pagination) =>
    set((state) => ({
      pagination: { ...state.pagination, ...pagination },
    })),

  fetchOffers: async (params) => {
    const { filters, pagination } = get();
    const page = params?.page || pagination.page;
    const activeFilters = params?.filters || filters;

    set({ isLoading: true, error: null });

    try {
      const queryParams = new URLSearchParams();
      queryParams.set('page', String(page));
      queryParams.set('page_size', String(pagination.pageSize));

      if (activeFilters.category) {
        queryParams.set('category', activeFilters.category);
      }
      if (activeFilters.status) {
        queryParams.set('status', activeFilters.status);
      }
      if (activeFilters.buildingId) {
        queryParams.set('building_id', activeFilters.buildingId);
      }

      const response = await fetch(
        `${API_URL}/api/v1/offers?${queryParams}`,
        {
          headers: {
            ...getAuthHeader(),
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch offers');
      }

      const data = (await response.json()) as {
        offers?: Offer[];
        items?: Offer[];
        page?: number;
        page_size?: number;
        total?: number;
        has_more?: boolean;
      };
      const list = data.offers ?? data.items ?? [];

      set({
        offers: page === 1 ? list : [...get().offers, ...list],
        pagination: {
          page: data.page ?? page,
          pageSize: data.page_size ?? get().pagination.pageSize,
          total: data.total ?? list.length,
          hasMore: data.has_more ?? false,
        },
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch offers',
      });
    } finally {
      set({ isLoading: false });
    }
  },

  fetchOffer: async (id) => {
    set({ isLoading: true, error: null });

    try {
      const response = await fetch(`${API_URL}/api/v1/offers/${id}`, {
        headers: {
          ...getAuthHeader(),
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch offer');
      }

      const offer = await response.json();
      set({ currentOffer: offer });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'Failed to fetch offer',
      });
    } finally {
      set({ isLoading: false });
    }
  },

  createOffer: async (data) => {
    set({ isLoading: true, error: null });

    try {
      const response = await fetch(`${API_URL}/api/v1/offers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          title: data.title,
          description: data.description,
          category: data.category,
          base_price: data.basePrice,
          min_participants: data.minParticipants,
          max_participants: data.maxParticipants,
          building_id: data.buildingId,
          deadline: data.deadline,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create offer');
      }

      const offer = (await response.json()) as Offer;
      get().addOffer(offer);
      return offer;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to create offer';
      set({ error: message });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  joinOffer: async (offerId, unitCount = 1) => {
    set({ isLoading: true, error: null });

    try {
      const response = await fetch(`${API_URL}/api/v1/offers/${offerId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ unit_count: unitCount }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to join offer');
      }

      // Refresh offer data
      await get().fetchOffer(offerId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to join offer';
      set({ error: message });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },

  leaveOffer: async (offerId) => {
    set({ isLoading: true, error: null });

    try {
      const response = await fetch(`${API_URL}/api/v1/offers/${offerId}/leave`, {
        method: 'POST',
        headers: {
          ...getAuthHeader(),
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to leave offer');
      }

      // Refresh offer data
      await get().fetchOffer(offerId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to leave offer';
      set({ error: message });
      throw error;
    } finally {
      set({ isLoading: false });
    }
  },
}));

// Selector hooks
export const useOffers = () => useOfferStore((state) => state.offers);
export const useCurrentOffer = () => useOfferStore((state) => state.currentOffer);
export const useOfferFilters = () => useOfferStore((state) => state.filters);
export const useOfferLoading = () => useOfferStore((state) => state.isLoading);
export const useOfferError = () => useOfferStore((state) => state.error);
