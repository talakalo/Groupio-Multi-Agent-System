import { describe, it, expect } from 'vitest';

import { getDefaultRouteForRole } from '@/lib/constants/roleRouting';

describe('getDefaultRouteForRole', () => {
  it('returns /admin/dashboard for super_admin', () => {
    expect(getDefaultRouteForRole('super_admin')).toBe('/admin/dashboard');
  });

  it('returns /admin/dashboard for admin', () => {
    expect(getDefaultRouteForRole('admin')).toBe('/admin/dashboard');
  });

  it('returns /buildings-manager/dashboard for buildings_manager', () => {
    expect(getDefaultRouteForRole('buildings_manager')).toBe('/buildings-manager/dashboard');
  });

  it('returns /contractor/dashboard for contractor', () => {
    expect(getDefaultRouteForRole('contractor')).toBe('/contractor/dashboard');
  });

  it('returns /dashboard for resident', () => {
    expect(getDefaultRouteForRole('resident')).toBe('/dashboard');
  });

  it('returns /dashboard for unknown or empty role', () => {
    expect(getDefaultRouteForRole('')).toBe('/dashboard');
    expect(getDefaultRouteForRole('unknown')).toBe('/dashboard');
  });
});
