import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

const SUPPORTED_LOCALES = ["he", "en"] as const;
type Locale = (typeof SUPPORTED_LOCALES)[number];

function parseLangHeader(acceptLang: string): Locale | null {
  // e.g. "en-US,en;q=0.9,he;q=0.8" → "en"
  const langs = acceptLang
    .split(",")
    .map((s) => s.trim().split(";")[0].trim().toLowerCase().slice(0, 2));
  for (const lang of langs) {
    if ((SUPPORTED_LOCALES as readonly string[]).includes(lang)) {
      return lang as Locale;
    }
  }
  return null;
}

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const headerStore = await headers();

  const cookieLocale =
    cookieStore.get("NEXT_LOCALE")?.value ||
    cookieStore.get("locale")?.value ||
    null;

  const headerLocale = parseLangHeader(
    headerStore.get("accept-language") ?? ""
  );

  const raw = cookieLocale ?? headerLocale ?? "he";
  const locale: Locale = (SUPPORTED_LOCALES as readonly string[]).includes(raw)
    ? (raw as Locale)
    : "he";

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
