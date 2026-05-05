import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => {
    const map: Record<string, string> = {
      reviewsError: "לא ניתן לטעון ביקורות",
      reviewsEmpty: "אין עדיין ביקורות לקבלן זה",
      reviewNoComment: "דירוג ללא תגובה",
      reviewsShowingPartial: `מציג ${vars?.shown} מתוך ${vars?.total} ביקורות`,
    };
    return map[key] ?? key;
  },
}));

const mockGetContractorReviews = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    getContractorReviews: (...args: unknown[]) => mockGetContractorReviews(...args),
  },
  ApiError: class ApiError extends Error {
    constructor(public message: string, public status?: number) {
      super(message);
    }
  },
}));

import { ContractorReviewsList } from "../components/shared/ContractorReviewsList";

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mockGetContractorReviews.mockReset();
});

describe("ContractorReviewsList", () => {
  it("renders the empty state when no reviews exist", async () => {
    mockGetContractorReviews.mockResolvedValueOnce({ items: [], total: 0 });

    renderWithQuery(<ContractorReviewsList contractorId="c1" />);

    await waitFor(() =>
      expect(screen.getByTestId("contractor-reviews-empty")).toBeInTheDocument(),
    );
  });

  it("renders rating + comment for each review", async () => {
    mockGetContractorReviews.mockResolvedValueOnce({
      items: [
        {
          id: "r1",
          contractor_id: "c1",
          rating: 5,
          comment: "Excellent work",
          created_at: "2026-04-01T10:00:00Z",
        },
        {
          id: "r2",
          contractor_id: "c1",
          rating: 3,
          comment: undefined,
          created_at: "2026-04-02T10:00:00Z",
        },
      ],
      total: 2,
    });

    renderWithQuery(<ContractorReviewsList contractorId="c1" />);

    await waitFor(() =>
      expect(screen.getByTestId("contractor-reviews-list")).toBeInTheDocument(),
    );
    expect(screen.getByText("Excellent work")).toBeInTheDocument();
    // Rendered fallback for the no-comment row.
    expect(screen.getByText(/דירוג ללא תגובה/)).toBeInTheDocument();
  });

  it("renders an error message when the request fails", async () => {
    mockGetContractorReviews.mockRejectedValueOnce(new Error("boom"));

    renderWithQuery(<ContractorReviewsList contractorId="c1" />);

    await waitFor(() =>
      expect(screen.getByTestId("contractor-reviews-error")).toBeInTheDocument(),
    );
  });

  it("shows a 'showing X of Y' note when total > items.length", async () => {
    mockGetContractorReviews.mockResolvedValueOnce({
      items: [
        {
          id: "r1",
          contractor_id: "c1",
          rating: 4,
          comment: "Good",
          created_at: "2026-04-01T10:00:00Z",
        },
      ],
      total: 12,
    });

    renderWithQuery(<ContractorReviewsList contractorId="c1" limit={1} />);

    await waitFor(() =>
      expect(screen.getByTestId("contractor-reviews-list")).toBeInTheDocument(),
    );
    expect(screen.getByText(/מציג 1 מתוך 12 ביקורות/)).toBeInTheDocument();
  });

  it("forwards the limit parameter to the API client", async () => {
    mockGetContractorReviews.mockResolvedValueOnce({ items: [], total: 0 });

    renderWithQuery(<ContractorReviewsList contractorId="c42" limit={5} />);

    await waitFor(() => expect(mockGetContractorReviews).toHaveBeenCalled());
    expect(mockGetContractorReviews).toHaveBeenCalledWith("c42", { limit: 5 });
  });
});
