import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { describe, it, expect, vi } from 'vitest';
import MobileOfferCard from '../components/MobileOfferCard';
import type { Offer } from '@groupio/types';

// Create a complete mock that satisfies the Offer type
const mockOffer = {
  id: 'offer-123',
  title: 'AC Installation',
  description: 'Group AC installation for building residents',
  category: 'ac_installation',
  basePrice: 5000,
  currentParticipants: 10,
  minParticipants: 5,
  maxParticipants: 20,
  status: 'pending',
  discount: 15,
  deadline: '2024-12-31',
  buildingId: 'building-1',
  contractorId: null,
  contractor: null,
  participants: [],
  createdAt: '2024-01-01',
  updatedAt: '2024-01-01',
  createdBy: 'user-1',
  pricingTiers: [],
  currentTier: null,
  tiers: [],
  expiresAt: '2024-12-31',
} as unknown as Offer;

describe('MobileOfferCard', () => {
  it('renders offer title', () => {
    const { getByText } = render(
      <MobileOfferCard offer={mockOffer} onPress={vi.fn()} />
    );

    expect(getByText('AC Installation')).toBeTruthy();
  });

  it('renders participant count', () => {
    const { getByText } = render(
      <MobileOfferCard offer={mockOffer} onPress={vi.fn()} />
    );

    expect(getByText(/10/)).toBeTruthy();
  });

  it('displays discount badge', () => {
    const { getByText } = render(
      <MobileOfferCard offer={mockOffer} onPress={vi.fn()} />
    );

    expect(getByText(/15%/)).toBeTruthy();
  });

  it('shows category icon', () => {
    const { getByTestId } = render(
      <MobileOfferCard offer={mockOffer} onPress={vi.fn()} />
    );

    expect(getByTestId('category-icon')).toBeTruthy();
  });

  it('calls onPress when tapped', () => {
    const onPress = vi.fn();
    const { getByTestId } = render(
      <MobileOfferCard offer={mockOffer} onPress={onPress} />
    );

    fireEvent.press(getByTestId('offer-card'));

    expect(onPress).toHaveBeenCalledWith(mockOffer);
  });

  it('shows progress bar', () => {
    const { getByTestId } = render(
      <MobileOfferCard offer={mockOffer} onPress={vi.fn()} />
    );

    expect(getByTestId('progress-bar')).toBeTruthy();
  });

  it('displays deadline', () => {
    const { getByText } = render(
      <MobileOfferCard offer={mockOffer} onPress={vi.fn()} />
    );

    expect(getByText(/2024/)).toBeTruthy();
  });

  it('handles missing discount gracefully', () => {
    const offerNoDiscount = { ...mockOffer, discount: undefined } as unknown as Offer;
    const { queryByText } = render(
      <MobileOfferCard offer={offerNoDiscount} onPress={vi.fn()} />
    );

    expect(queryByText(/%/)).toBeNull();
  });

  it('shows status badge', () => {
    const { getByTestId } = render(
      <MobileOfferCard offer={mockOffer} onPress={vi.fn()} />
    );

    expect(getByTestId('status-badge')).toBeTruthy();
  });

  it('applies correct status color', () => {
    const completedOffer = { ...mockOffer, status: 'completed' } as unknown as Offer;
    const { getByTestId } = render(
      <MobileOfferCard offer={completedOffer} onPress={vi.fn()} />
    );

    const badge = getByTestId('status-badge');
    expect(badge.props.style).toContainEqual(
      expect.objectContaining({ backgroundColor: expect.any(String) })
    );
  });
});

describe('MobileOfferCard Accessibility', () => {
  it('has accessibility label', () => {
    const { getByLabelText } = render(
      <MobileOfferCard offer={mockOffer} onPress={vi.fn()} />
    );

    expect(getByLabelText(/AC Installation/)).toBeTruthy();
  });

  it('is accessible as a button', () => {
    const { getByRole } = render(
      <MobileOfferCard offer={mockOffer} onPress={vi.fn()} />
    );

    expect(getByRole('button')).toBeTruthy();
  });
});

describe('MobileOfferCard Formatting', () => {
  it('formats price in ILS', () => {
    const { getByText } = render(
      <MobileOfferCard offer={mockOffer} onPress={vi.fn()} />
    );

    expect(getByText(/₪|5,000/)).toBeTruthy();
  });

  it('formats large numbers with commas', () => {
    const expensiveOffer = { ...mockOffer, basePrice: 100000 } as unknown as Offer;
    const { getByText } = render(
      <MobileOfferCard offer={expensiveOffer} onPress={vi.fn()} />
    );

    expect(getByText(/100,000/)).toBeTruthy();
  });
});
