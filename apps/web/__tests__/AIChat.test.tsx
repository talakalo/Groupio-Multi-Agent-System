import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { AIChat } from "../components/features/chat/AIChat";

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

function renderWithProviders(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      {/* Cast for React 18 vs 19 ReactNode type mismatch in test env */}
      {ui as Parameters<typeof QueryClientProvider>[0]["children"]}
    </QueryClientProvider>
  );
}

describe("AIChat", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("renders chat input", () => {
    renderWithProviders(
      <AIChat buildingId="bld_001" suggestions={["מצא קבלן"]} />
    );
    expect(screen.getByPlaceholderText(/הקלד/)).toBeDefined();
  });

  it("renders suggestion chips", () => {
    const suggestions = ["מצא קבלן מזגנים", "כמה עולה?"];
    renderWithProviders(
      <AIChat buildingId="bld_001" suggestions={suggestions} />
    );
    expect(screen.getByText("מצא קבלן מזגנים")).toBeDefined();
    expect(screen.getByText("כמה עולה?")).toBeDefined();
  });

  it("renders welcome message", () => {
    renderWithProviders(
      <AIChat buildingId="bld_001" suggestions={[]} />
    );
    // Use getAllByText since the text appears in header and welcome message
    const elements = screen.getAllByText(/גרופיו/);
    expect(elements.length).toBeGreaterThan(0);
  });

  it("sends message on form submit", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          conversationId: "conv_1",
          response: { type: "text", message: "Test response" },
          metadata: { intent: "general_info", confidence: 0.9, agentsUsed: ["support"], tokensUsed: 100, durationMs: 500, needsHuman: false },
        }),
    });

    renderWithProviders(
      <AIChat buildingId="bld_001" suggestions={[]} />
    );

    const input = screen.getByPlaceholderText(/הקלד/);
    fireEvent.change(input, { target: { value: "שלום" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  it("disables input while loading", async () => {
    mockFetch.mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderWithProviders(
      <AIChat buildingId="bld_001" suggestions={[]} />
    );

    const input = screen.getByPlaceholderText(/הקלד/) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "test" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => {
      expect(input.disabled).toBe(true);
    });
  });
});
