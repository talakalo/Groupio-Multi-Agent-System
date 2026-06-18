/** Keys used by app/contractor/profile/page.tsx under contractor.profile */
import { describe, it, expect } from 'vitest';

import enMessages from '../messages/en.json';
import heMessages from '../messages/he.json';

const PROFILE_KEYS = [
  'contractor.profile.title',
  'contractor.profile.subtitle',
  'contractor.profile.tabs.info',
  'contractor.profile.tabs.documents',
  'contractor.profile.tabs.settings',
  'contractor.profile.trustScore.title',
  'contractor.profile.categories.plumbing',
  'contractor.profile.regions.north',
  'contractor.profile.save',
] as const;

const MEMBERSHIP_I18N_KEYS = [
  'contractor.profile.settings.membershipTitle',
  'contractor.profile.settings.membershipDescription',
  'contractor.profile.settings.membershipStatusLabel',
  'contractor.profile.settings.membershipPeriodEnd',
  'contractor.profile.settings.membershipNextBilling',
  'contractor.profile.settings.membershipSubscribe',
  'contractor.profile.settings.membershipStatusLoading',
  'contractor.profile.settings.membershipCheckoutLoading',
  'contractor.profile.settings.membershipCheckoutError',
  'contractor.profile.settings.membershipLoadError',
  'contractor.profile.settings.membershipSuccessBanner',
  'contractor.profile.settings.membershipCanceledBanner',
  'contractor.profile.settings.membershipStates.active',
  'contractor.profile.settings.membershipStates.trialing',
  'contractor.profile.settings.membershipStates.renewal',
  'contractor.profile.settings.membershipStates.past_due',
  'contractor.profile.settings.membershipStates.grace',
  'contractor.profile.settings.membershipStates.canceled',
  'contractor.profile.settings.membershipStates.expired',
  'contractor.profile.settings.membershipStates.inactive',
  'contractor.profile.settings.membershipStates.unknown',
] as const;

function getNested(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: unknown, key) => {
    if (acc && typeof acc === 'object' && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

describe('contractor profile i18n', () => {
  it('en and he define contractor.profile keys used by /contractor/profile', () => {
    for (const key of PROFILE_KEYS) {
      const en = getNested(enMessages as Record<string, unknown>, key);
      const he = getNested(heMessages as Record<string, unknown>, key);
      expect(en, `Missing en: ${key}`).toBeDefined();
      expect(he, `Missing he: ${key}`).toBeDefined();
      expect(typeof en).toBe('string');
      expect(typeof he).toBe('string');
    }
  });

  it('en and he define marketplace membership strings on contractor profile', () => {
    for (const key of MEMBERSHIP_I18N_KEYS) {
      const en = getNested(enMessages as Record<string, unknown>, key);
      const he = getNested(heMessages as Record<string, unknown>, key);
      expect(en, `Missing en: ${key}`).toBeDefined();
      expect(he, `Missing he: ${key}`).toBeDefined();
      expect(typeof en).toBe('string');
      expect(typeof he).toBe('string');
    }
  });
});
