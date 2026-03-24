import createMiddleware from "next-intl/middleware";

export default createMiddleware({
  locales: ["he", "en"],
  defaultLocale: "he",
  localePrefix: "never",
  localeDetection: false,
});

export const config = {
  matcher: ["/((?!api|_next|.*\\..*).*)"],
};
