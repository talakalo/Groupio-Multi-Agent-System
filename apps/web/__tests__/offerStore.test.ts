import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useOfferStore } from '../lib/stores/offerStore';
import { useAuthStore } from '../lib/stores/authStore';
import type { Offer } from '@groupio/types';

// Mock fetch
global.fetch = vi.fn();

// Mock localStorage for zustand persist
const createLocalStorageMock = () => {
  let store: Record<string, string> = {};
  return {
    get store() { return store; },
    set store(val: Record<string, string>) { store = val; },
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
};

const localStorageMock = createLocalStorageMock();
Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Helper to create a mock Offer
const createMockOffer = (overrides: Partial<Offer> & { id: string }): Offer =>
  ({
    id: overrides.id,
    category: 'ac_installation',
    basePrice: 5000,
    status: 'active',
    buildingId: 'building-1',
    contractorId: 'contractor-1',
    contractor: {
      id: 'contractor-1',
      businessName: 'AC Pro',
      licenseNumber: 'LIC-123',
      verified: true,
      rating: 4.5,
      categories: ['ac_installation'],
      regions: ['center'],
    },
    participants: 10,
    currentTier: 0,
    tiers: [{ min: 5, max: 20, discount: 15, price: 4250 }],
    createdAt: '2024-01-01',
    expiresAt: '2025-12-31',
    ...overrides,
  }) as unknown as Offer;

describe('Offer Store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();

    // Reset offer store
    useOfferStore.setState({
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
    });

    // Set a default auth token
    useAuthStore.setState({
      accessToken: 'test-access-token',
      refreshToken: null,
      user: null,
      isAuthenticated: true,
      isLoading: false,
    });
  });

  // ---- Synchronous CRUD ----

  describe('setOffers', () => {
    it('replaces offers array', () => {
      const offers = [
        createMockOffer({ id: 'offer-1' }),
        createMockOffer({ id: 'offer-2' }),
      ];

      useOfferStore.getState().setOffers(offers);

      expect(useOfferStore.getState().offers).toEqual(offers);
      expect(useOfferStore.getState().offers).toHaveLength(2);
    });
  });

  describe('addOffer', () => {
    it('prepends to offers', () => {
      const existing = createMockOffer({ id: 'offer-1' });
      useOfferStore.setState({ offers: [existing] });

      const newOffer = createMockOffer({ id: 'offer-2' });
      useOfferStore.getState().addOffer(newOffer);

      const offers = useOfferStore.getState().offers;
      expect(offers).toHaveLength(2);
      expect(offers[0].id).toBe('offer-2');
      expect(offers[1].id).toBe('offer-1');
    });
  });

  describe('updateOffer', () => {
    it('updates matching offer', () => {
      const offers = [
        createMockOffer({ id: 'offer-1', basePrice: 5000 }),
        createMockOffer({ id: 'offer-2', basePrice: 3000 }),
      ];
      useOfferStore.setState({ offers });

      useOfferStore.getState().updateOffer('offer-1', { basePrice: 7000 } as Partial<Offer>);

      const updated = useOfferStore.getState().offers;
      expect(updated[0].basePrice).toBe(7000);
      expect(updated[1].basePrice).toBe(3000);
    });

    it('also updates currentOffer if matching', () => {
      const offer = createMockOffer({ id: 'offer-1', basePrice: 5000 });
      useOfferStore.setState({
        offers: [offer],
        currentOffer: offer,
      });

      useOfferStore.getState().updateOffer('offer-1', { basePrice: 9000 } as Partial<Offer>);

      expect(useOfferStore.getState().currentOffer?.basePrice).toBe(9000);
    });
  });

  describe('removeOffer', () => {
    it('filters out by id', () => {
      const offers = [
        createMockOffer({ id: 'offer-1' }),
        createMockOffer({ id: 'offer-2' }),
      ];
      useOfferStore.setState({ offers });

      useOfferStore.getState().removeOffer('offer-1');

      const remaining = useOfferStore.getState().offers;
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe('offer-2');
    });

    it('clears currentOffer if matching', () => {
      const offer = createMockOffer({ id: 'offer-1' });
      useOfferStore.setState({
        offers: [offer],
        currentOffer: offer,
      });

      useOfferStore.getState().removeOffer('offer-1');

      expect(useOfferStore.getState().currentOffer).toBeNull();
    });
  });

  // ---- State setters ----

  describe('setFilters', () => {
    it('merges with existing filters', () => {
      useOfferStore.getState().setFilters({ category: 'ac_installation' });
      useOfferStore.getState().setFilters({ status: 'active' });

      expect(useOfferStore.getState().filters).toEqual({
        category: 'ac_installation',
        status: 'active',
      });
    });
  });

  describe('clearFilters', () => {
    it('resets to empty', () => {
      useOfferStore.getState().setFilters({
        category: 'plumbing',
        status: 'pending',
      });

      useOfferStore.getState().clearFilters();

      expect(useOfferStore.getState().filters).toEqual({});
    });
  });

  // ---- Async actions ----

  describe('fetchOffers', () => {
    it('calls api with correct params', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [createMockOffer({ id: 'offer-1' })],
          page: 1,
          page_size: 20,
          total: 1,
          has_more: false,
        }),
      });

      await useOfferStore.getState().fetchOffers({ page: 1 });

      expect(global.fetch).toHaveBeenCalledTimes(1);
      const callUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(callUrl).toContain('/api/v1/offers');
      expect(callUrl).toContain('page=1');
      expect(callUrl).toContain('page_size=20');

      const callOptions = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(callOptions.headers).toHaveProperty('Authorization', 'Bearer test-access-token');
    });

    it('applies category filter to query params', async () => {
      useOfferStore.getState().setFilters({ category: 'plumbing' });

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [],
          page: 1,
          page_size: 20,
          total: 0,
          has_more: false,
        }),
      });

      await useOfferStore.getState().fetchOffers();

      const callUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(callUrl).toContain('category=plumbing');
    });

    it('sets offers in store after success', async () => {
      const offer = createMockOffer({ id: 'offer-fetched' });
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [offer],
          page: 1,
          page_size: 20,
          total: 1,
          has_more: false,
        }),
      });

      await useOfferStore.getState().fetchOffers();

      expect(useOfferStore.getState().offers).toHaveLength(1);
      expect(useOfferStore.getState().offers[0].id).toBe('offer-fetched');
      expect(useOfferStore.getState().isLoading).toBe(false);
    });

    it('sets error on failure', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      await useOfferStore.getState().fetchOffers();

      expect(useOfferStore.getState().error).toBe('Failed to fetch offers');
      expect(useOfferStore.getState().isLoading).toBe(false);
    });
  });

  describe('fetchOffer', () => {
    it('sets currentOffer on success', async () => {
      const offer = createMockOffer({ id: 'offer-single' });
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => offer,
      });

      await useOfferStore.getState().fetchOffer('offer-single');

      expect(useOfferStore.getState().currentOffer).toEqual(offer);
      expect(useOfferStore.getState().isLoading).toBe(false);
    });

    it('sets error on failure', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      await useOfferStore.getState().fetchOffer('nonexistent');

      expect(useOfferStore.getState().error).toBe('Failed to fetch offer');
      expect(useOfferStore.getState().isLoading).toBe(false);
    });
  });

  describe('createOffer', () => {
    it('posts and adds to store', async () => {
      const createdOffer = createMockOffer({ id: 'new-offer' });

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => createdOffer,
      });

      const result = await useOfferStore.getState().createOffer({
        title: 'Test Offer',
        description: 'Test Description',
        category: 'ac_installation',
        basePrice: 5000,
        minParticipants: 5,
        maxParticipants: 20,
        buildingId: 'building-1',
      });

      expect(result.id).toBe('new-offer');

      // Verify POST call
      const callOptions = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(callOptions.method).toBe('POST');
      expect(callOptions.headers).toHaveProperty('Content-Type', 'application/json');
      expect(callOptions.headers).toHaveProperty('Authorization', 'Bearer test-access-token');

      const body = JSON.parse(callOptions.body);
      expect(body.title).toBe('Test Offer');
      expect(body.base_price).toBe(5000);
      expect(body.min_participants).toBe(5);

      // Verify offer was added to store (prepended)
      expect(useOfferStore.getState().offers).toHaveLength(1);
      expect(useOfferStore.getState().offers[0].id).toBe('new-offer');
    });

    it('throws and sets error on failure', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ detail: 'Validation error' }),
      });

      await expect(
        useOfferStore.getState().createOffer({
          title: 'Bad Offer',
          description: 'Will fail',
          category: 'plumbing',
          basePrice: 0,
          minParticipants: 0,
          maxParticipants: 0,
          buildingId: 'building-1',
        })
      ).rejects.toThrow('Validation error');

      expect(useOfferStore.getState().error).toBe('Validation error');
    });
  });

  describe('joinOffer', () => {
    it('posts and refreshes offer', async () => {
      const offer = createMockOffer({ id: 'offer-join', participants: 10 });

      // First call: POST /offers/:id/join
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      // Second call: fetchOffer refresh
      const updatedOffer = createMockOffer({ id: 'offer-join', participants: 11 });
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => updatedOffer,
      });

      await useOfferStore.getState().joinOffer('offer-join', 1);

      // Verify POST to join endpoint
      const joinCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(joinCall[0]).toContain('/api/v1/offers/offer-join/join');
      expect(joinCall[1].method).toBe('POST');
      const body = JSON.parse(joinCall[1].body);
      expect(body.unit_count).toBe(1);

      // Verify the offer was refreshed
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(useOfferStore.getState().currentOffer?.participants).toBe(11);
    });

    it('throws on failure', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ detail: 'Offer is full' }),
      });

      await expect(
        useOfferStore.getState().joinOffer('offer-full')
      ).rejects.toThrow('Offer is full');

      expect(useOfferStore.getState().error).toBe('Offer is full');
    });
  });

  describe('leaveOffer', () => {
    it('posts and refreshes offer', async () => {
      // First call: POST /offers/:id/leave
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });

      // Second call: fetchOffer refresh
      const updatedOffer = createMockOffer({ id: 'offer-leave', participants: 9 });
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => updatedOffer,
      });

      await useOfferStore.getState().leaveOffer('offer-leave');

      // Verify POST to leave endpoint
      const leaveCall = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(leaveCall[0]).toContain('/api/v1/offers/offer-leave/leave');
      expect(leaveCall[1].method).toBe('POST');

      // Verify the offer was refreshed
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(useOfferStore.getState().currentOffer?.participants).toBe(9);
    });

    it('throws on failure', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        json: async () => ({ detail: 'Not a participant' }),
      });

      await expect(
        useOfferStore.getState().leaveOffer('offer-not-joined')
      ).rejects.toThrow('Not a participant');

      expect(useOfferStore.getState().error).toBe('Not a participant');
    });
  });

  // ---- Edge cases ----

  describe('edge cases', () => {
    it('fetchOffers without auth token omits Authorization header', async () => {
      useAuthStore.setState({ accessToken: null });

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [],
          page: 1,
          page_size: 20,
          total: 0,
          has_more: false,
        }),
      });

      await useOfferStore.getState().fetchOffers();

      const callOptions = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(callOptions.headers).not.toHaveProperty('Authorization');
    });

    it('setCurrentOffer sets and clears', () => {
      const offer = createMockOffer({ id: 'offer-1' });
      useOfferStore.getState().setCurrentOffer(offer);
      expect(useOfferStore.getState().currentOffer).toEqual(offer);

      useOfferStore.getState().setCurrentOffer(null);
      expect(useOfferStore.getState().currentOffer).toBeNull();
    });

    it('removeOffer does not clear currentOffer if id does not match', () => {
      const offerA = createMockOffer({ id: 'offer-a' });
      const offerB = createMockOffer({ id: 'offer-b' });
      useOfferStore.setState({
        offers: [offerA, offerB],
        currentOffer: offerB,
      });

      useOfferStore.getState().removeOffer('offer-a');

      expect(useOfferStore.getState().currentOffer).toEqual(offerB);
      expect(useOfferStore.getState().offers).toHaveLength(1);
    });

    it('updateOffer does not change currentOffer if id does not match', () => {
      const offerA = createMockOffer({ id: 'offer-a', basePrice: 1000 });
      const offerB = createMockOffer({ id: 'offer-b', basePrice: 2000 });
      useOfferStore.setState({
        offers: [offerA, offerB],
        currentOffer: offerB,
      });

      useOfferStore.getState().updateOffer('offer-a', { basePrice: 9999 } as Partial<Offer>);

      expect(useOfferStore.getState().currentOffer?.basePrice).toBe(2000);
    });
  });
});
