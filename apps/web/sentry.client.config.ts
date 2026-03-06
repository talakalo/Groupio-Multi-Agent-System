// Sentry client-side initialization.
// Install @sentry/nextjs to enable: pnpm add @sentry/nextjs
;(function () {
  const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (sentryDsn && typeof window !== 'undefined') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Sentry = require('@sentry/nextjs');
      Sentry.init({ dsn: sentryDsn, environment: process.env.NODE_ENV, tracesSampleRate: 0.1 });
    } catch {
      // @sentry/nextjs not installed — skipping client-side Sentry init
    }
  }
})();
