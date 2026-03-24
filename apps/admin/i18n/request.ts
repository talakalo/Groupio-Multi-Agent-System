import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

const locales = ["he", "en"] as const;
export type AppLocale = (typeof locales)[number];

export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const raw = cookieStore.get("NEXT_LOCALE")?.value ?? "he";
  const locale = (locales as readonly string[]).includes(raw) ? raw : "he";

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
