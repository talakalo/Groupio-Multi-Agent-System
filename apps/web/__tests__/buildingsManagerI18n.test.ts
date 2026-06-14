/**
 * Ensures buildings-manager translation keys exist in locale files.
 * Prevents raw keys from rendering in the UI.
 */
import { describe, it, expect } from 'vitest';

import enMessages from '../messages/en.json';
import heMessages from '../messages/he.json';

const requiredDashboardKeys = [
  'buildingsManager.dashboard.title',
  'buildingsManager.dashboard.subtitle',
  'buildingsManager.dashboard.stats.totalBuildings',
  'buildingsManager.dashboard.stats.totalResidents',
  'buildingsManager.dashboard.stats.activeOffers',
  'buildingsManager.dashboard.stats.openEscalations',
  'buildingsManager.dashboard.viewAll',
  'buildingsManager.dashboard.recentBuildings',
  'buildingsManager.dashboard.openEscalations',
  'buildingsManager.dashboard.noBuildings',
  'buildingsManager.dashboard.noEscalations',
  'buildingsManager.dashboard.units',
  'buildingsManager.dashboard.open',
];

const requiredNavKeys = [
  'buildingsManagerNav.dashboard',
  'buildingsManagerNav.buildings',
  'buildingsManagerNav.escalations',
  'buildingsManagerNav.role',
  'buildingsManagerNav.roleSuperAdmin',
  'buildingsManagerNav.roleAdmin',
  'buildingsManagerNav.myAccount',
];

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: unknown, key) => {
    if (acc && typeof acc === 'object' && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

describe('buildingsManager i18n', () => {
  it('he.json contains all buildingsManager.dashboard keys', () => {
    for (const key of requiredDashboardKeys) {
      const value = getNested(heMessages as Record<string, unknown>, key);
      expect(value, `Missing he: ${key}`).toBeDefined();
      expect(typeof value).toBe('string');
    }
  });

  it('he.json contains all buildingsManagerNav keys', () => {
    for (const key of requiredNavKeys) {
      const value = getNested(heMessages as Record<string, unknown>, key);
      expect(value, `Missing he: ${key}`).toBeDefined();
      expect(typeof value).toBe('string');
    }
  });

  it('en.json contains all buildingsManager.dashboard keys', () => {
    for (const key of requiredDashboardKeys) {
      const value = getNested(enMessages as Record<string, unknown>, key);
      expect(value, `Missing en: ${key}`).toBeDefined();
      expect(typeof value).toBe('string');
    }
  });

  it('en.json contains all buildingsManagerNav keys', () => {
    for (const key of requiredNavKeys) {
      const value = getNested(enMessages as Record<string, unknown>, key);
      expect(value, `Missing en: ${key}`).toBeDefined();
      expect(typeof value).toBe('string');
    }
  });
});

const requiredAdminKeys = [
  'admin.dashboard.title',
  'admin.dashboard.subtitle',
  'admin.dashboard.buildingsManagerCard.title',
  'admin.dashboard.buildingsManagerCard.description',
  'admin.dashboard.systemSettingsCard.title',
  'admin.dashboard.systemSettingsCard.description',
  'adminNav.dashboard',
  'adminNav.buildingsManager',
  'adminNav.roleSuperAdmin',
  'adminNav.roleAdmin',
  'adminNav.myAccount',
];

describe('admin i18n', () => {
  it('he.json and en.json contain admin keys', () => {
    for (const key of requiredAdminKeys) {
      const heVal = getNested(heMessages as Record<string, unknown>, key);
      const enVal = getNested(enMessages as Record<string, unknown>, key);
      expect(heVal, `Missing he: ${key}`).toBeDefined();
      expect(enVal, `Missing en: ${key}`).toBeDefined();
    }
  });
});
