import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock useAuthStore before importing client so the module-level reference is mocked
vi.mock('../lib/stores/authStore', () => ({
  useAuthStore: {
    getState: vi.fn(() => ({ accessToken: 'test-token' })),
  },
}));

import { useAuthStore } from '../lib/stores/authStore';

// We need to import after mocks are set up
// The module exports a singleton `apiClient` and the `ApiError` class
const { apiClient, ApiError } = await import('../lib/api/client');

// Mock global.fetch
global.fetch = vi.fn();

describe('ApiClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset auth mock to default token
    vi.mocked(useAuthStore.getState).mockReturnValue({
      accessToken: 'test-token',
    } as ReturnType<typeof useAuthStore.getState>);
    // Clear retry handler
    apiClient.setOn401Retry(null);
  });

  // ---- Auth header handling ----

  describe('request auth headers', () => {
    it('includes auth header when token exists', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [], total: 0, page: 1, page_size: 20, has_more: false }),
      });

      await apiClient.getOffers('building-1');

      const callOptions = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(callOptions.headers).toHaveProperty('Authorization', 'Bearer test-token');
    });

    it('omits auth header when no token', async () => {
      vi.mocked(useAuthStore.getState).mockReturnValue({
        accessToken: null,
      } as ReturnType<typeof useAuthStore.getState>);

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [], total: 0, page: 1, page_size: 20, has_more: false }),
      });

      await apiClient.getOffers('building-1');

      const callOptions = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(callOptions.headers).not.toHaveProperty('Authorization');
    });
  });

  // ---- 401 retry handling ----

  describe('401 retry', () => {
    it('triggers retry with new token on 401', async () => {
      apiClient.setOn401Retry(async () => {
        // Simulate refreshing the token
        vi.mocked(useAuthStore.getState).mockReturnValue({
          accessToken: 'refreshed-token',
        } as ReturnType<typeof useAuthStore.getState>);
        return 'refreshed-token';
      });

      // First call: 401
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ detail: 'Token expired' }),
      });

      // Retry call: success
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'offer-1',
          category: 'ac_installation',
        }),
      });

      const result = await apiClient.getOffer('offer-1');

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(result).toHaveProperty('id', 'offer-1');

      // Second call should use refreshed token
      const retryOptions = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[1][1];
      expect(retryOptions.headers).toHaveProperty('Authorization', 'Bearer refreshed-token');
    });

    it('throws on 401 without retry handler', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ detail: 'Token expired' }),
      });

      await expect(apiClient.getOffer('offer-1')).rejects.toThrow('Token expired');
    });

    it('throws when retry handler returns null', async () => {
      apiClient.setOn401Retry(async () => null);

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ detail: 'Cannot refresh' }),
      });

      await expect(apiClient.getOffer('offer-1')).rejects.toThrow('Cannot refresh');
    });

    it('does NOT trigger refresh on 401 for auth endpoints (login, signup, refresh)', async () => {
      const refreshFn = vi.fn();
      apiClient.setOn401Retry(refreshFn);

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ detail: 'Invalid credentials' }),
      });

      await expect(apiClient.login({ email: 'u@ex.com', password: 'x' })).rejects.toThrow(
        'Invalid credentials'
      );
      expect(refreshFn).not.toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  // ---- ApiError ----

  describe('ApiError', () => {
    it('includes status and body', () => {
      const error = new ApiError('Not Found', 404, { detail: 'Resource not found' });

      expect(error.status).toBe(404);
      expect(error.message).toBe('Not Found');
      expect(error.body).toEqual({ detail: 'Resource not found' });
      expect(error.name).toBe('ApiError');
      expect(error).toBeInstanceOf(Error);
    });

    it('parses detail as string', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ detail: 'Invalid input data' }),
      });

      await expect(apiClient.getOffer('bad-id')).rejects.toThrow('Invalid input data');
    });

    it('parses detail as array', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        json: async () => ({
          detail: [
            { msg: 'field required', loc: ['body', 'title'] },
            { msg: 'value too short', loc: ['body', 'description'] },
          ],
        }),
      });

      await expect(apiClient.getOffer('bad-id')).rejects.toThrow(
        'field required, value too short'
      );
    });

    it('falls back to statusText when body has no detail', async () => {
      // PERF-1: HTTP 5xx is NOT retried by the client (UI / react-query
      // handles retry), so a single mocked 500 is enough.
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: 'something broke' }),
      });

      await expect(apiClient.getOffer('err')).rejects.toThrow('Internal Server Error');
    });
  });

  // ---- Endpoint-specific tests ----

  describe('sendMessage', () => {
    it('posts to correct endpoint', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          conversationId: 'conv-1',
          response: { type: 'text', message: 'Hello' },
          metadata: { intent: null, confidence: 0.9, agentsUsed: [], tokensUsed: 50, durationMs: 200, needsHuman: false },
        }),
      });

      await apiClient.sendMessage({
        user_id: 'user-1',
        message: 'Hello',
        channel: 'web',
      });

      const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('/api/v1/message');
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body);
      expect(body.message).toBe('Hello');
      expect(body.user_id).toBe('user-1');
    });
  });

  describe('getOffers', () => {
    it('includes query params', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [], total: 0, page: 1, page_size: 10, has_more: false }),
      });

      await apiClient.getOffers('building-1', {
        category: 'plumbing',
        status: 'active',
        page: 2,
        page_size: 10,
      });

      const callUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(callUrl).toContain('building_id=building-1');
      expect(callUrl).toContain('category=plumbing');
      expect(callUrl).toContain('status=active');
      expect(callUrl).toContain('page=2');
      expect(callUrl).toContain('page_size=10');
    });

    it('omits undefined optional params', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [], total: 0, page: 1, page_size: 20, has_more: false }),
      });

      await apiClient.getOffers('building-1');

      const callUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(callUrl).toContain('building_id=building-1');
      expect(callUrl).not.toContain('category=');
      expect(callUrl).not.toContain('status=');
    });
  });

  describe('createOffer', () => {
    it('posts offer data', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'created-offer',
          category: 'electrical',
          basePrice: 3000,
        }),
      });

      const result = await apiClient.createOffer({
        title: 'Electrical Upgrade',
        description: 'Building-wide electrical upgrade',
        category: 'electrical',
        base_price: 3000,
        min_participants: 3,
        max_participants: 15,
        building_id: 'building-1',
      });

      expect(result.id).toBe('created-offer');

      const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('/api/v1/offers');
      expect(options.method).toBe('POST');
    });
  });

  describe('joinOffer', () => {
    it('posts to join endpoint with userId in body', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'joined', offer_id: 'offer-123' }),
      });

      const result = await apiClient.joinOffer('offer-123', { userId: 'user-456' });

      const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('/api/v1/offers/offer-123/join');
      expect(options.method).toBe('POST');
      const body = JSON.parse(options.body as string);
      expect(body.user_id).toBe('user-456');
      expect(body.unit_count).toBe(1);
      expect(result.status).toBe('joined');
    });
  });

  describe('login', () => {
    it('returns token', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 3600,
        }),
      });

      const result = await apiClient.login({
        email: 'test@example.com',
        password: 'password123',
      });

      expect(result.token).toBe('new-access-token');
      expect(result.access_token).toBe('new-access-token');

      const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('/api/v1/auth/login/json');
      expect(options.method).toBe('POST');
    });
  });

  describe('getOffer', () => {
    it('fetches single offer by id', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'offer-42', category: 'kitchen' }),
      });

      const result = await apiClient.getOffer('offer-42');

      const callUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(callUrl).toContain('/api/v1/offers/offer-42');
      expect(result.id).toBe('offer-42');
    });
  });

  describe('notifications', () => {
    it('getNotifications builds query string', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          items: [],
          total: 0,
          limit: 50,
          offset: 0,
        }),
      });

      await apiClient.getNotifications({ limit: 10, offset: 5, unread_only: true });

      const callUrl = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(callUrl).toContain('/api/v1/notifications');
      expect(callUrl).toContain('limit=10');
      expect(callUrl).toContain('offset=5');
      expect(callUrl).toContain('unread_only=true');
    });

    it('markNotificationRead posts to read endpoint', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'ok' }),
      });

      await apiClient.markNotificationRead('n1');

      const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(url).toContain('/api/v1/notifications/n1/read');
      expect(options.method).toBe('POST');
    });
  });
});
