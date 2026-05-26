/**
 * Format a price amount as Israeli Shekel currency string.
 *
 * @param amount - The numeric price value
 * @param currency - Currency code, defaults to "ILS"
 * @returns Formatted string, e.g. "\u20AA1,500" or "$1,500"
 */
export function formatPrice(amount: number, currency: string = "ILS"): string {
  const symbolMap: Record<string, string> = {
    ILS: "\u20AA",
    USD: "$",
    EUR: "\u20AC",
    GBP: "\u00A3",
  };

  const symbol = symbolMap[currency] ?? currency;
  const formatted = Math.round(amount).toLocaleString("en-IL");
  return `${symbol}${formatted}`;
}

/**
 * Format a date string or Date object into a localized display string.
 *
 * @param date - ISO date string or Date instance
 * @param locale - BCP 47 locale tag, defaults to "he-IL"
 * @returns Formatted date string, e.g. "15 \u05D1\u05E0\u05D5\u05D1\u05F3 2025"
 */
export function formatDate(date: string | Date | undefined | null, locale: string = "he-IL"): string {
  if (date == null) return "";
  const d = typeof date === "string" ? new Date(date) : date;

  if (isNaN(d.getTime())) {
    return String(date);
  }

  return d.toLocaleDateString(locale, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Format a decimal number as a percentage string.
 *
 * @param value - The value to format (0.15 becomes "15%", 15 stays "15%")
 * @returns Formatted percentage string
 */
export function formatPercentage(value: number): string {
  // If value is between -1 and 1 (exclusive), treat as a decimal ratio
  const pct = Math.abs(value) < 1 ? value * 100 : value;
  const rounded = Math.round(pct * 10) / 10;

  // Drop the decimal if it's .0
  const display = rounded % 1 === 0 ? Math.round(rounded) : rounded;
  return `${display}%`;
}

/**
 * Format a phone number string into standard Israeli display format.
 *
 * Handles inputs like:
 *   "0501234567"       -> "050-123-4567"
 *   "+972501234567"    -> "050-123-4567"
 *   "050-1234567"      -> "050-123-4567"
 *   "+972-50-1234567"  -> "050-123-4567"
 *
 * @param phone - Raw phone number string
 * @returns Formatted Israeli phone number, or the original string if unparseable
 */
export function formatPhoneNumber(phone: string): string {
  // Strip all non-digit characters
  const digits = phone.replace(/\D/g, "");

  // Handle +972 international prefix (972 + 9 digits for mobile, or 972 + 8 for landline)
  if (digits.startsWith("972") && digits.length >= 12) {
    const local = "0" + digits.slice(3);
    return formatLocalNumber(local);
  }

  // Handle local Israeli numbers (10 digits for mobile, 9 for landline)
  if (digits.startsWith("0") && (digits.length === 10 || digits.length === 9)) {
    return formatLocalNumber(digits);
  }

  // Could not parse -- return original
  return phone;
}

function formatLocalNumber(digits: string): string {
  // Mobile: 0XX-XXX-XXXX (10 digits, prefix is 3 chars)
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  // Landline: 0X-XXX-XXXX (9 digits, prefix is 2 chars)
  if (digits.length === 9) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
  }

  return digits;
}
