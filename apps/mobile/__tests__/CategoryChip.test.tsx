import type { ServiceCategory } from '@groupio/types';
import { render, fireEvent } from '@testing-library/react-native';
import React from 'react';
import { describe, it, expect, vi } from 'vitest';

import CategoryChip from '../components/CategoryChip';


describe('CategoryChip', () => {
  it('renders category label for ac_installation', () => {
    const { getByText } = render(
      <CategoryChip category="ac_installation" />
    );

    // Hebrew label for ac_installation is "התקנת מזגנים"
    expect(getByText('התקנת מזגנים')).toBeTruthy();
  });

  it('renders "הכל" for the "all" category', () => {
    const { getByText } = render(
      <CategoryChip category="all" />
    );

    expect(getByText('הכל')).toBeTruthy();
  });

  it('renders different category labels', () => {
    const categories: ServiceCategory[] = [
      'plumbing',
      'electrical',
      'kitchen',
      'painting',
    ];

    const expectedLabels: Record<string, string> = {
      plumbing: 'אינסטלציה',
      electrical: 'חשמל',
      kitchen: 'מטבחים',
      painting: 'צביעה',
    };

    for (const category of categories) {
      const { getByText } = render(
        <CategoryChip category={category} />
      );
      expect(getByText(expectedLabels[category])).toBeTruthy();
    }
  });

  it('handles onPress callback', () => {
    const onPress = vi.fn();

    const { getByText } = render(
      <CategoryChip category="plumbing" onPress={onPress} />
    );

    const chip = getByText('אינסטלציה');
    fireEvent.press(chip);

    expect(onPress).toHaveBeenCalledWith('plumbing');
  });

  it('handles onPress for "all" category', () => {
    const onPress = vi.fn();

    const { getByText } = render(
      <CategoryChip category="all" onPress={onPress} />
    );

    const chip = getByText('הכל');
    fireEvent.press(chip);

    expect(onPress).toHaveBeenCalledWith('all');
  });

  it('renders selected state correctly', () => {
    const { getByText } = render(
      <CategoryChip category="electrical" selected={true} />
    );

    // Verify it renders without error in selected state
    expect(getByText('חשמל')).toBeTruthy();
  });

  it('renders unselected state by default', () => {
    const { getByText } = render(
      <CategoryChip category="heating" />
    );

    // Default selected is false
    expect(getByText('חימום')).toBeTruthy();
  });

  it('does not crash when onPress is not provided', () => {
    const { getByText } = render(
      <CategoryChip category="security" />
    );

    const chip = getByText('אבטחה');
    // Pressing without onPress should not throw
    fireEvent.press(chip);
  });

  it('renders all available categories without error', () => {
    const allCategories: ServiceCategory[] = [
      'ac_installation',
      'ac_maintenance',
      'kitchen',
      'electrical',
      'plumbing',
      'heating',
      'renovations',
      'painting',
      'flooring',
      'windows',
      'security',
    ];

    for (const category of allCategories) {
      const { getByText } = render(
        <CategoryChip category={category} />
      );
      // Each should render without throwing
      expect(getByText(/.+/)).toBeTruthy();
    }
  });
});
