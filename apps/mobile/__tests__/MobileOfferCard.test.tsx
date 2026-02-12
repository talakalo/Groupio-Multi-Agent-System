import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { describe, it, expect, vi } from 'vitest';
import MobileOfferCard from '../components/MobileOfferCard';
import type { Offer } from '@groupio/types';

const mockOffer = {
  id: 'offer-123',
  category: 'ac_installation',
  basePrice: 5000,
  status: 'active',
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
  tiers: [
    { min: 5, max: 10, discount: 15, price: 4250 },
    { min: 11, max: 20, discount: 20, price: 4000 },
  ],
  expiresAt: '2027-12-31',
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
  createdBy: 'user-1',
  buildingId: 'building-1',
  contractorId: 'contractor-1',
} as unknown as Offer;

describe('MobileOfferCard', () => {
  it('renders contractor business name', () => {
    const { getByText } = render(
      <MobileOfferCard offer={mockOffer} onPress={vi.fn()} />
    );
    expect(getByText('AC Pro')).toBeTruthy();
  });

  it('renders participant count', () => {
    const { getByText } = render(
      <MobileOfferCard offer={mockOffer} onPress={vi.fn()} />
    );
    expect(getByText(/10/)).toBeTruthy();
  });

  it('displays discount badge with tier percentage', () => {
    const { getByText } = render(
      <MobileOfferCard offer={mockOffer} onPress={vi.fn()} />
    );
    expect(getByText(/-15%/)).toBeTruthy();
  });

  it('renders base price with shekel symbol', () => {
    const { getByText } = render(
      <MobileOfferCard offer={mockOffer} onPress={vi.fn()} />
    );
    expect(getByText(/₪/)).toBeTruthy();
    expect(getByText(/5,000/)).toBeTruthy();
  });

  it('renders current tier price', () => {
    const { getByText } = render(
      <MobileOfferCard offer={mockOffer} onPress={vi.fn()} />
    );
    expect(getByText(/4,250/)).toBeTruthy();
  });

  it('renders contractor rating', () => {
    const { getByText } = render(
      <MobileOfferCard offer={mockOffer} onPress={vi.fn()} />
    );
    expect(getByText('4.5')).toBeTruthy();
  });

  it('calls onPress when card is tapped', () => {
    const onPress = vi.fn();
    const { getByTestId } = render(
      <MobileOfferCard offer={mockOffer} onPress={onPress} />
    );
    fireEvent.press(getByTestId('offer-card'));
    expect(onPress).toHaveBeenCalledWith(mockOffer);
  });

  it('calls onJoin when join button is pressed', () => {
    const onJoin = vi.fn();
    const { getByTestId } = render(
      <MobileOfferCard offer={mockOffer} onJoin={onJoin} />
    );
    fireEvent.press(getByTestId('join-button'));
    expect(onJoin).toHaveBeenCalledWith('offer-123');
  });

  it('hides discount badge when tier discount is zero', () => {
    const noDiscountOffer = {
      ...mockOffer,
      tiers: [{ min: 5, max: 20, discount: 0, price: 5000 }],
    } as unknown as Offer;
    const { queryByText } = render(
      <MobileOfferCard offer={noDiscountOffer} onPress={vi.fn()} />
    );
    expect(queryByText(/-\d+%/)).toBeNull();
  });

  it('shows join text when offer is active', () => {
    const { getByText } = render(
      <MobileOfferCard offer={mockOffer} onPress={vi.fn()} />
    );
    // "הצטרף להצעה" = Join offer
    expect(getByText(/הצטרף/)).toBeTruthy();
  });

  it('shows expired text when offer has past deadline', () => {
    const expiredOffer = {
      ...mockOffer,
      status: 'active',
      expiresAt: '2020-01-01',
    } as unknown as Offer;
    const { getByText } = render(
      <MobileOfferCard offer={expiredOffer} onPress={vi.fn()} />
    );
    // "פג תוקף" = Expired
    expect(getByText(/פג תוקף/)).toBeTruthy();
  });

  it('shows unavailable text when offer status is not active', () => {
    const pendingOffer = {
      ...mockOffer,
      status: 'pending',
      expiresAt: '2027-12-31',
    } as unknown as Offer;
    const { getByText } = render(
      <MobileOfferCard offer={pendingOffer} onPress={vi.fn()} />
    );
    // "לא זמין" = Not available
    expect(getByText(/לא זמין/)).toBeTruthy();
  });

  it('shows next tier hint when more tiers exist', () => {
    const { getByText } = render(
      <MobileOfferCard offer={mockOffer} onPress={vi.fn()} />
    );
    // Next tier needs 11 min, current participants is 10, so 1 more needed
    // "עוד 1 להנחה נוספת!" = 1 more for additional discount!
    expect(getByText(/עוד/)).toBeTruthy();
  });
});

describe('MobileOfferCard Formatting', () => {
  it('formats price with shekel symbol', () => {
    const { getByText } = render(
      <MobileOfferCard offer={mockOffer} onPress={vi.fn()} />
    );
    expect(getByText(/₪/)).toBeTruthy();
  });

  it('formats large numbers with commas', () => {
    const expensiveOffer = {
      ...mockOffer,
      basePrice: 100000,
      tiers: [{ min: 5, max: 20, discount: 10, price: 90000 }],
    } as unknown as Offer;
    const { getByText } = render(
      <MobileOfferCard offer={expensiveOffer} onPress={vi.fn()} />
    );
    expect(getByText(/100,000/)).toBeTruthy();
  });
});
