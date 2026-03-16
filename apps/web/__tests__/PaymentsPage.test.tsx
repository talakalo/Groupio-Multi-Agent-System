import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

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
  (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => data,
    text: async () => JSON.stringify(data),
  });
}

function mockFetchFailure() {
  (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
    new Error("Network error")
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
    // Set a token so the apiClient sends auth headers
    if (typeof window !== "undefined") {
      window.localStorage.setItem("auth_token", "test-token");
    }
  });

  // ---- Loading & Error States ----

  it("shows loading state initially", () => {
    mockFetchNeverResolve();
    render(<PaymentsPage />);
    expect(screen.getByText(/טוען תשלומים/)).toBeDefined();
  });

  it("shows error state when API fails", async () => {
    mockFetchFailure();
    render(<PaymentsPage />);

    await waitFor(() => {
      expect(screen.getByText(/לא ניתן לטעון/)).toBeDefined();
    });
  });

  it("shows retry button on error", async () => {
    mockFetchFailure();
    render(<PaymentsPage />);

    await waitFor(() => {
      // "נסה שוב" appears in both the error message and button; check that a clickable element exists
      const retryElements = screen.getAllByText(/נסה שוב/);
      expect(retryElements.length).toBeGreaterThanOrEqual(1);
    });
  });

  // ---- Successful Render ----

  it("renders page header and escrow explainer", async () => {
    mockFetchSuccess(MOCK_PAYMENTS);
    render(<PaymentsPage />);

    // Header is always rendered (not dependent on data)
    expect(screen.getByText(/התשלומים שלי/)).toBeDefined();
    expect(screen.getByText(/התשלום שלך מוגן/)).toBeDefined();
  });

  it("renders stat cards", async () => {
    mockFetchSuccess(MOCK_PAYMENTS);
    render(<PaymentsPage />);

    await waitFor(() => {
      expect(screen.getByText(/סה״כ שולם/)).toBeDefined();
      expect(screen.getByText(/תשלומים ממתינים/)).toBeDefined();
      expect(screen.getByText(/הצעות פעילות/)).toBeDefined();
    });
  });

  it("renders all payments in list", async () => {
    mockFetchSuccess(MOCK_PAYMENTS);
    render(<PaymentsPage />);

    await waitFor(() => {
      expect(screen.getByText(/offer-10/)).toBeDefined();
      expect(screen.getByText(/offer-20/)).toBeDefined();
      expect(screen.getByText(/offer-30/)).toBeDefined();
    });
  });

  it("renders payment status badges in Hebrew", async () => {
    mockFetchSuccess(MOCK_PAYMENTS);
    render(<PaymentsPage />);

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
    render(<PaymentsPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "הכל" })).toBeDefined();
      expect(screen.getByRole("button", { name: "ממתינים" })).toBeDefined();
      expect(screen.getByRole("button", { name: "שולמו" })).toBeDefined();
      expect(screen.getByRole("button", { name: "הוחזרו" })).toBeDefined();
    });
  });

  it("filters to show only pending payments", async () => {
    mockFetchSuccess(MOCK_PAYMENTS);
    render(<PaymentsPage />);

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
    render(<PaymentsPage />);

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
    render(<PaymentsPage />);

    await waitFor(() => {
      expect(screen.getByText(/עדיין אין תשלומים/)).toBeDefined();
    });
  });

  it("shows category empty state when filter yields no results", async () => {
    mockFetchSuccess([MOCK_PAYMENTS[0]]);
    render(<PaymentsPage />);

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
    mockFetchSuccess(MOCK_PAYMENTS);
    render(<PaymentsPage />);

    await waitFor(() => {
      expect(screen.getByText(/offer-10/)).toBeDefined();
    });

    // Mock the second fetch for the refresh
    mockFetchSuccess(MOCK_PAYMENTS);
    fireEvent.click(screen.getByText("רענון"));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});
