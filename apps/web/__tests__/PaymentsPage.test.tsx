import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock next-intl — return stable t() so useCallback deps don't change every render
const paymentsKeys: Record<string, string> = {
  title: "התשלומים שלי",
  subtitle: "ניהול תשלומים, חשבוניות וסטטוס נאמנות",
  yourPaymentProtected: "התשלום שלך מוגן",
  loadError: "לא ניתן לטעון את התשלומים. נסה שוב.",
  retry: "נסה שוב",
  totalPaid: "סה״כ שולם",
  pendingPayments: "תשלומים ממתינים",
  activeOffersCount: "הצעות פעילות",
  filterAll: "הכל",
  filterPending: "ממתינים",
  filterSucceeded: "שולמו",
  filterRefunded: "הוחזרו",
  noPayments: "עדיין אין תשלומים",
  noPaymentsInCategory: "אין תשלומים בקטגוריה זו",
  refresh: "רענון",
  offerLabel: "הצעה #{id}",
  "status.pending": "ממתין לתשלום",
  "status.succeeded": "שולם",
  "status.refunded": "הוחזר",
};
const stableT = (key: string, values?: Record<string, string>) => {
  const val = paymentsKeys[key];
  if (val && values) return val.replace(/#\{(\w+)\}/g, (_, k) => values[k] ?? "");
  return val ?? key;
};
vi.mock("next-intl", () => ({
  useTranslations: () => stableT,
}));

// Mock global.fetch (same pattern as admin tests)
// The PaymentsPage uses apiClient.getMyPayments() which internally calls fetch
global.fetch = vi.fn();

// Mock the auth store - apiClient uses useAuthStore.getState().accessToken
vi.mock("@/lib/stores/authStore", () => {
  const state = {
    user: { id: "user-123", name: "Test User" },
    accessToken: "test-token",
    isAuthenticated: true,
  };
  const fn = (() => state) as ReturnType<typeof vi.fn> & { getState: () => typeof state };
  fn.getState = () => state;
  return { useAuthStore: fn };
});

import { apiClient } from "../lib/api/client";
import PaymentsPage from "../app/(resident)/payments/page";

const MOCK_PAYMENTS = [
  {
    id: "pay-001",
    userId: "user-123",
    offerId: "offer-100",
    amount: 4500,
    currency: "ILS",
    status: "succeeded",
    transactionId: "txn_001",
    createdAt: "2026-01-15T10:00:00Z",
  },
  {
    id: "pay-002",
    userId: "user-123",
    offerId: "offer-200",
    amount: 3200,
    currency: "ILS",
    status: "pending",
    createdAt: "2026-02-01T10:00:00Z",
  },
  {
    id: "pay-003",
    userId: "user-123",
    offerId: "offer-300",
    amount: 1800,
    currency: "ILS",
    status: "refunded",
    createdAt: "2026-02-05T10:00:00Z",
  },
];

function mockFetchSuccess(data: unknown) {
  // Persistent: the page is rendered behind react-query; the client-side
  // retry logic (PERF-1) may also fire multiple attempts on flaky paths.
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
  });
}

function mockFetchFailure() {
  // Persistent: apiClient retries transient failures; every attempt must fail
  // for the react-query error state to surface.
  (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
    new Error("Network error")
  );
}

function mockFetchNeverResolve() {
  (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
    () => new Promise(() => {})
  );
}

/** Render under a fresh QueryClient with retries disabled for deterministic tests. */
function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>,
  );
}

describe("PaymentsPage", () => {
  beforeEach(() => {
    // Reset fully so persistent mockResolvedValue/mockRejectedValue from prior
    // tests doesn't leak into the next one.
    (global.fetch as ReturnType<typeof vi.fn>).mockReset();
    // PERF-1: apiClient is a module-level singleton with an in-flight GET
    // dedup map — clear it between tests so a never-resolving mock in one
    // test can't poison a later test hitting the same endpoint.
    apiClient.__resetInternalsForTests();
    // Set a token so the apiClient sends auth headers
    if (typeof window !== "undefined") {
      window.localStorage.setItem("auth_token", "test-token");
    }
  });

  // ---- Loading & Error States ----

  it("shows loading state initially", () => {
    mockFetchNeverResolve();
    renderWithClient(<PaymentsPage />);
    // During loading, header and skeleton placeholders are shown
    expect(screen.getByText("התשלומים שלי")).toBeInTheDocument();
  });

  it("shows error state when API fails", async () => {
    mockFetchFailure();
    renderWithClient(<PaymentsPage />);

    // PERF-1: apiClient retries transient failures with exponential backoff
    // before surfacing the error to react-query, so allow extra time.
    await waitFor(
      () => {
        expect(screen.getByText(/לא ניתן לטעון/)).toBeDefined();
      },
      { timeout: 8000 },
    );
  }, 10_000);

  it("shows retry button on error", async () => {
    mockFetchFailure();
    renderWithClient(<PaymentsPage />);

    await waitFor(
      () => {
        const retryElements = screen.getAllByText(/נסה שוב/);
        expect(retryElements.length).toBeGreaterThanOrEqual(1);
      },
      { timeout: 8000 },
    );
  }, 10_000);

  // ---- Successful Render ----

  it("renders page header and escrow explainer", async () => {
    mockFetchSuccess(MOCK_PAYMENTS);
    renderWithClient(<PaymentsPage />);

    // Header is always rendered (not dependent on data)
    expect(screen.getByText(/התשלומים שלי/)).toBeDefined();
    expect(screen.getByText(/התשלום שלך מוגן/)).toBeDefined();
  });

  it("renders stat cards", async () => {
    mockFetchSuccess(MOCK_PAYMENTS);
    renderWithClient(<PaymentsPage />);

    await waitFor(() => {
      expect(screen.getByText(/סה״כ שולם/)).toBeDefined();
      expect(screen.getByText(/תשלומים ממתינים/)).toBeDefined();
      expect(screen.getByText(/הצעות פעילות/)).toBeDefined();
    });
  });

  it("renders all payments in list", async () => {
    mockFetchSuccess(MOCK_PAYMENTS);
    renderWithClient(<PaymentsPage />);

    await waitFor(() => {
      expect(screen.getByText(/offer-10/)).toBeDefined();
      expect(screen.getByText(/offer-20/)).toBeDefined();
      expect(screen.getByText(/offer-30/)).toBeDefined();
    });
  });

  it("renders payment status badges in Hebrew", async () => {
    mockFetchSuccess(MOCK_PAYMENTS);
    renderWithClient(<PaymentsPage />);

    await waitFor(() => {
      // Check that status badges render (using getAllByText since some might match partially)
      expect(screen.getByText("שולם")).toBeDefined();
      expect(screen.getByText("ממתין לתשלום")).toBeDefined();
      expect(screen.getByText("הוחזר")).toBeDefined();
    });
  });

  // ---- Filter Tabs ----

  it("renders filter tabs", async () => {
    mockFetchSuccess(MOCK_PAYMENTS);
    renderWithClient(<PaymentsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "הכל" })).toBeDefined();
      expect(screen.getByRole("button", { name: "ממתינים" })).toBeDefined();
      expect(screen.getByRole("button", { name: "שולמו" })).toBeDefined();
      expect(screen.getByRole("button", { name: "הוחזרו" })).toBeDefined();
    });
  });

  it("filters to show only pending payments", async () => {
    mockFetchSuccess(MOCK_PAYMENTS);
    renderWithClient(<PaymentsPage />);

    await waitFor(() => {
      expect(screen.getByText(/offer-10/)).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "ממתינים" }));

    await waitFor(() => {
      expect(screen.getByText(/offer-20/)).toBeDefined();
      expect(screen.queryByText(/offer-10/)).toBeNull();
      expect(screen.queryByText(/offer-30/)).toBeNull();
    });
  });

  it("filters to show only succeeded payments", async () => {
    mockFetchSuccess(MOCK_PAYMENTS);
    renderWithClient(<PaymentsPage />);

    await waitFor(() => {
      expect(screen.getByText(/offer-10/)).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "שולמו" }));

    await waitFor(() => {
      expect(screen.getByText(/offer-10/)).toBeDefined();
      expect(screen.queryByText(/offer-20/)).toBeNull();
    });
  });

  // ---- Empty State ----

  it("shows empty state when no payments exist", async () => {
    mockFetchSuccess([]);
    renderWithClient(<PaymentsPage />);

    await waitFor(() => {
      expect(screen.getByText(/עדיין אין תשלומים/)).toBeDefined();
    });
  });

  it("shows category empty state when filter yields no results", async () => {
    mockFetchSuccess([MOCK_PAYMENTS[0]]);
    renderWithClient(<PaymentsPage />);

    await waitFor(() => {
      expect(screen.getByText(/offer-10/)).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "הוחזרו" }));

    await waitFor(() => {
      expect(screen.getByText(/אין תשלומים בקטגוריה זו/)).toBeDefined();
    });
  });

  // ---- Refresh ----

  it("calls API again when refresh button is clicked", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => MOCK_PAYMENTS,
        text: async () => JSON.stringify(MOCK_PAYMENTS),
      })
    );
    renderWithClient(<PaymentsPage />);

    await waitFor(() => {
      expect(screen.getByText(/offer-10/)).toBeDefined();
    });

    const callCountBefore = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    fireEvent.click(screen.getByText("רענון"));

    await waitFor(() => {
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(callCountBefore);
    });
  });
});
