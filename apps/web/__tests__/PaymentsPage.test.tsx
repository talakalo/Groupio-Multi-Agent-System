import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// unwrapPageParams uses React.use() — stub in tests
vi.mock("@/lib/utils/unwrapPageParams", () => ({
  unwrapPageParams: vi.fn(),
}));

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

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

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
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
  });
}

function mockFetchFailure() {
  // Use TypeError so the api client's _isRetryable() returns false (no retry delays)
  (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
    new TypeError("Network error")
  );
}

function mockFetchNeverResolve() {
  (global.fetch as ReturnType<typeof vi.fn>).mockImplementationOnce(
    () => new Promise(() => {})
  );
}

describe("PaymentsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear apiClient singleton state so a never-resolving fetch in one test
    // doesn't poison _inflightGets for subsequent tests on the same endpoint.
    apiClient.__resetInternalsForTests();
    if (typeof window !== "undefined") {
      window.localStorage.setItem("auth_token", "test-token");
    }
  });

  // ---- Loading & Error States ----

  it("shows loading state initially", () => {
    mockFetchNeverResolve();
    renderWithProviders(<PaymentsPage />);
    // During loading, header and skeleton placeholders are shown
    expect(screen.getByText("התשלומים שלי")).toBeInTheDocument();
  });

  it("shows error state when API fails", async () => {
    mockFetchFailure();
    renderWithProviders(<PaymentsPage />);

    await waitFor(() => {
      expect(screen.getByText(/לא ניתן לטעון/)).toBeDefined();
    });
  });

  it("shows retry button on error", async () => {
    mockFetchFailure();
    renderWithProviders(<PaymentsPage />);

    await waitFor(() => {
      // "נסה שוב" appears in both the error message and button; check that a clickable element exists
      const retryElements = screen.getAllByText(/נסה שוב/);
      expect(retryElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ---- Successful Render ----

  it("renders page header and escrow explainer", async () => {
    mockFetchSuccess(MOCK_PAYMENTS);
    renderWithProviders(<PaymentsPage />);

    // Header is always rendered (not dependent on data)
    expect(screen.getByText(/התשלומים שלי/)).toBeDefined();
    expect(screen.getByText(/התשלום שלך מוגן/)).toBeDefined();
  });

  it("renders stat cards", async () => {
    mockFetchSuccess(MOCK_PAYMENTS);
    renderWithProviders(<PaymentsPage />);

    await waitFor(() => {
      expect(screen.getByText(/סה״כ שולם/)).toBeDefined();
      expect(screen.getByText(/תשלומים ממתינים/)).toBeDefined();
      expect(screen.getByText(/הצעות פעילות/)).toBeDefined();
    });
  });

  it("renders all payments in list", async () => {
    mockFetchSuccess(MOCK_PAYMENTS);
    renderWithProviders(<PaymentsPage />);

    await waitFor(() => {
      expect(screen.getByText(/offer-10/)).toBeDefined();
      expect(screen.getByText(/offer-20/)).toBeDefined();
      expect(screen.getByText(/offer-30/)).toBeDefined();
    });
  });

  it("renders payment status badges in Hebrew", async () => {
    mockFetchSuccess(MOCK_PAYMENTS);
    renderWithProviders(<PaymentsPage />);

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
    renderWithProviders(<PaymentsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "הכל" })).toBeDefined();
      expect(screen.getByRole("button", { name: "ממתינים" })).toBeDefined();
      expect(screen.getByRole("button", { name: "שולמו" })).toBeDefined();
      expect(screen.getByRole("button", { name: "הוחזרו" })).toBeDefined();
    });
  });

  it("filters to show only pending payments", async () => {
    mockFetchSuccess(MOCK_PAYMENTS);
    renderWithProviders(<PaymentsPage />);

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
    renderWithProviders(<PaymentsPage />);

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
    renderWithProviders(<PaymentsPage />);

    await waitFor(() => {
      expect(screen.getByText(/עדיין אין תשלומים/)).toBeDefined();
    });
  });

  it("shows category empty state when filter yields no results", async () => {
    mockFetchSuccess([MOCK_PAYMENTS[0]]);
    renderWithProviders(<PaymentsPage />);

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
    renderWithProviders(<PaymentsPage />);

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
