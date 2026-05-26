/**
 * Resident nav must stay in sync with locale files. Duplicate top-level `residentNav`
 * keys in JSON make the last object win (can drop `payments` while keeping `architecture`).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

import heMessages from '../messages/he.json';
import enMessages from '../messages/en.json';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MESSAGES_DIR = join(__dirname, '../messages');

const RESIDENT_NAV_KEYS = [
  'dashboard',
  'offers',
  'contractors',
  'architecture',
  'building',
  'profile',
  'payments',
  'aiAssistant',
  'myAccount',
  'myAccountHint',
  'accountMenu',
  'logout',
] as const;

function getResidentNav(obj: Record<string, unknown>) {
  return obj.residentNav as Record<string, string> | undefined;
}

function topLevelDuplicateKeys(jsonText: string): string[] {
  const keys: string[] = [];
  const re = /^\s{2}"([^"]+)"\s*:/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(jsonText)) !== null) {
    keys.push(m[1]);
  }
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const k of keys) {
    if (seen.has(k)) dups.add(k);
    seen.add(k);
  }
  return [...dups];
}

describe('residentNav i18n', () => {
  it('en.json and he.json define all residentNav keys used by the layout', () => {
    const en = getResidentNav(enMessages as Record<string, unknown>);
    const he = getResidentNav(heMessages as Record<string, unknown>);
    expect(en, 'en residentNav missing').toBeDefined();
    expect(he, 'he residentNav missing').toBeDefined();
    for (const key of RESIDENT_NAV_KEYS) {
      expect(en![key], `Missing en residentNav.${key}`).toBeTruthy();
      expect(he![key], `Missing he residentNav.${key}`).toBeTruthy();
    }
  });

  it('locale JSON files have no duplicate top-level keys', () => {
    for (const f of ['en.json', 'he.json']) {
      const text = readFileSync(join(MESSAGES_DIR, f), 'utf8');
      const dups = topLevelDuplicateKeys(text);
      expect(dups, `${f} duplicate top-level keys: ${dups.join(', ')}`).toEqual([]);
    }
  });
});
