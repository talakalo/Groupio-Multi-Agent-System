import type { ServiceCategory, Region } from "@groupio/types";

/**
 * Hebrew display names for service categories.
 * Mirrors the backend mapping in src/utils/hebrew_utils.py -> CATEGORY_NAMES_HE
 */
export const categoryNamesHe: Record<ServiceCategory, string> = {
  ac_installation: "\u05D4\u05EA\u05E7\u05E0\u05EA \u05DE\u05D6\u05D2\u05E0\u05D9\u05DD",
  ac_maintenance: "\u05EA\u05D7\u05D6\u05D5\u05E7\u05EA \u05DE\u05D6\u05D2\u05E0\u05D9\u05DD",
  kitchen: "\u05DE\u05D8\u05D1\u05D7\u05D9\u05DD",
  electrical: "\u05D7\u05E9\u05DE\u05DC",
  plumbing: "\u05D0\u05D9\u05E0\u05E1\u05D8\u05DC\u05E6\u05D9\u05D4",
  heating: "\u05D7\u05D9\u05DE\u05D5\u05DD",
  renovations: "\u05E9\u05D9\u05E4\u05D5\u05E6\u05D9\u05DD",
  painting: "\u05E6\u05D1\u05D9\u05E2\u05D4",
  flooring: "\u05E8\u05D9\u05E6\u05D5\u05E3",
  windows: "\u05D7\u05DC\u05D5\u05E0\u05D5\u05EA",
};

/**
 * English display names for service categories (human-readable).
 */
export const categoryNamesEn: Record<ServiceCategory, string> = {
  ac_installation: "AC Installation",
  ac_maintenance: "AC Maintenance",
  kitchen: "Kitchen",
  electrical: "Electrical",
  plumbing: "Plumbing",
  heating: "Heating",
  renovations: "Renovations",
  painting: "Painting",
  flooring: "Flooring",
  windows: "Windows",
};

/**
 * Hebrew display names for regions.
 * Mirrors the backend mapping in src/utils/hebrew_utils.py -> REGION_NAMES_HE
 */
export const regionNamesHe: Record<Region, string> = {
  center: "\u05DE\u05E8\u05DB\u05D6",
  tel_aviv: "\u05EA\u05DC \u05D0\u05D1\u05D9\u05D1",
  jerusalem: "\u05D9\u05E8\u05D5\u05E9\u05DC\u05D9\u05DD",
  haifa: "\u05D7\u05D9\u05E4\u05D4",
  north: "\u05E6\u05E4\u05D5\u05DF",
  south: "\u05D3\u05E8\u05D5\u05DD",
  sharon: "\u05E9\u05E8\u05D5\u05DF",
  shfela: "\u05E9\u05E4\u05DC\u05D4",
};

/**
 * English display names for regions (human-readable).
 */
export const regionNamesEn: Record<Region, string> = {
  center: "Center",
  tel_aviv: "Tel Aviv",
  jerusalem: "Jerusalem",
  haifa: "Haifa",
  north: "North",
  south: "South",
  sharon: "Sharon",
  shfela: "Shfela",
};

/**
 * All valid service category keys.
 */
export const allCategories: ServiceCategory[] = [
  "ac_installation",
  "ac_maintenance",
  "kitchen",
  "electrical",
  "plumbing",
  "heating",
  "renovations",
  "painting",
  "flooring",
  "windows",
];

/**
 * All valid region keys.
 */
export const allRegions: Region[] = [
  "center",
  "tel_aviv",
  "jerusalem",
  "haifa",
  "north",
  "south",
  "sharon",
  "shfela",
];

/**
 * Translate a service category key to a display name.
 *
 * @param category - The ServiceCategory key
 * @param lang - Target language ("he" or "en"), defaults to "he"
 * @returns Translated display name
 */
export function translateCategory(category: ServiceCategory, lang: "he" | "en" = "he"): string {
  return lang === "he" ? categoryNamesHe[category] : categoryNamesEn[category];
}

/**
 * Translate a region key to a display name.
 *
 * @param region - The Region key
 * @param lang - Target language ("he" or "en"), defaults to "he"
 * @returns Translated display name
 */
export function translateRegion(region: Region, lang: "he" | "en" = "he"): string {
  return lang === "he" ? regionNamesHe[region] : regionNamesEn[region];
}

/**
 * Look up a ServiceCategory key from a Hebrew display name.
 *
 * @param hebrewName - The Hebrew display string
 * @returns The matching ServiceCategory key, or undefined if not found
 */
export function categoryFromHebrew(hebrewName: string): ServiceCategory | undefined {
  const entry = Object.entries(categoryNamesHe).find(([, v]) => v === hebrewName);
  return entry ? (entry[0] as ServiceCategory) : undefined;
}

/**
 * Look up a Region key from a Hebrew display name.
 *
 * @param hebrewName - The Hebrew display string
 * @returns The matching Region key, or undefined if not found
 */
export function regionFromHebrew(hebrewName: string): Region | undefined {
  const entry = Object.entries(regionNamesHe).find(([, v]) => v === hebrewName);
  return entry ? (entry[0] as Region) : undefined;
}
