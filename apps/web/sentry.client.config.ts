// Sentry client-side initialization.
// Only activates when NEXT_PUBLIC_SENTRY_DSN is set in the environment.
import * as Sentry from "@sentry/nextjs";

const sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
  });
}
