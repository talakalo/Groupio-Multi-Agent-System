/** Keys used by app/contractor/profile/page.tsx under contractor.profile */
import { describe, it, expect } from 'vitest';

import heMessages from '../messages/he.json';
import enMessages from '../messages/en.json';

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
});
