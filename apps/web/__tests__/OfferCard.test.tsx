import type { Offer } from "@groupio/types";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../messages/he.json";

import { OfferCard } from "../components/features/offers/OfferCard";

function renderOfferCard(props: { offer: Offer }) {
  return render(
    <NextIntlClientProvider locale="he" messages={messages}>
      <OfferCard {...props} />
    </NextIntlClientProvider>
  );
}


const mockOffer: Offer = {
  id: "offer_001",
  category: "ac_installation",
  basePrice: 4500,
  status: "active",
  buildingId: "bld_001",
  contractorId: "con_001",
  contractor: {
    id: "con_001",
    businessName: "Cool Air Ltd",
    licenseNumber: "AC-12345",
    verified: true,
    rating: 4.8,
    categories: ["ac_installation"],
    regions: ["center"],
    description: "Professional AC installation",
  },
  participants: 5,
  currentTier: 0,
  tiers: [
    { min: 3, max: 5, discount: 5, price: 4275 },
    { min: 6, max: 10, discount: 10, price: 4050 },
    { min: 11, max: 20, discount: 15, price: 3825 },
    { min: 21, max: null, discount: 20, price: 3600 },
  ],
  createdAt: "2026-01-01T10:00:00Z",
  expiresAt: "2026-03-01T10:00:00Z",
};

describe("OfferCard", () => {
  it("renders contractor name", () => {
    renderOfferCard({ offer: mockOffer });
    expect(screen.getByText("Cool Air Ltd")).toBeDefined();
  });

  it("renders current price", () => {
    renderOfferCard({ offer: mockOffer });
    expect(screen.getByText(/4,275/)).toBeDefined();
  });

  it("renders discount badge", () => {
    renderOfferCard({ offer: mockOffer });
    expect(screen.getByText(/5%/)).toBeDefined();
  });

  it("renders participant count", () => {
    renderOfferCard({ offer: mockOffer });
    // Look for the Hebrew text "5 שכנים הצטרפו" (5 neighbors joined)
    expect(screen.getByText(/שכנים הצטרפו/)).toBeDefined();
  });

  it("renders join button", () => {
    renderOfferCard({ offer: mockOffer });
    // Use getAllByRole since there are multiple buttons (join and details)
    const buttons = screen.getAllByRole("button");
    expect(buttons.length).toBeGreaterThan(0);
    // Check that the join button exists
    expect(screen.getByText(/הצטרף להצעה/)).toBeDefined();
  });

  it("shows next tier info when available", () => {
    renderOfferCard({ offer: mockOffer });
    // Next tier is 6-10 at 10% discount, need 1 more neighbor
    expect(screen.getByText(/10%/)).toBeDefined();
  });
});
