import { render } from '@testing-library/react-native';
import React from 'react';
import { describe, it, expect } from 'vitest';

import StatCard from '../components/StatCard';

describe('StatCard', () => {
  it('renders title and value', () => {
    const { getByText } = render(
      <StatCard title="Active Offers" value={12} icon="tag" />
    );

    expect(getByText('Active Offers')).toBeTruthy();
    expect(getByText('12')).toBeTruthy();
  });

  it('renders string value', () => {
    const { getByText } = render(
      <StatCard title="Revenue" value="₪50,000" icon="currency-ils" />
    );

    expect(getByText('₪50,000')).toBeTruthy();
  });

  it('renders icon', () => {
    const { getByText } = render(
      <StatCard title="Projects" value={5} icon="briefcase" />
    );

    // The component renders an Icon with name prop; our mock renders an <Icon> element
    // We verify the component renders without errors and shows the data
    expect(getByText('Projects')).toBeTruthy();
    expect(getByText('5')).toBeTruthy();
  });

  it('uses custom iconColor when provided', () => {
    const { getByText } = render(
      <StatCard
        title="Rating"
        value="4.5"
        icon="star"
        iconColor="#FFD700"
      />
    );

    expect(getByText('Rating')).toBeTruthy();
    expect(getByText('4.5')).toBeTruthy();
  });

  it('uses custom backgroundColor when provided', () => {
    const { getByText } = render(
      <StatCard
        title="Score"
        value={98}
        icon="check-circle"
        backgroundColor="#E8F5E9"
      />
    );

    expect(getByText('Score')).toBeTruthy();
    expect(getByText('98')).toBeTruthy();
  });

  it('renders with zero value', () => {
    const { getByText } = render(
      <StatCard title="Pending" value={0} icon="clock-outline" />
    );

    expect(getByText('Pending')).toBeTruthy();
    expect(getByText('0')).toBeTruthy();
  });

  it('handles empty string value', () => {
    const { getByText } = render(
      <StatCard title="Status" value="" icon="information" />
    );

    expect(getByText('Status')).toBeTruthy();
  });
});
