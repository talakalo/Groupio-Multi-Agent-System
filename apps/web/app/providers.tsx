"use client";

import React, { Component, type ErrorInfo, type ReactNode, useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Sentry from "@sentry/nextjs";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "@/lib/stores/authStore";
import { LocaleSyncProvider } from "@/lib/providers/LocaleSyncProvider";
import { ToastContainer } from "@/components/shared/ToastContainer";

// PostHog analytics — optional, requires NEXT_PUBLIC_POSTHOG_KEY
if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_POSTHOG_KEY) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const posthog = require("posthog-js").default;
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
      capture_pageview: false,
    });
  } catch {
    // posthog-js not installed
  }
}

// ---------------------------------------------------------------------------
// Error boundary (class component, as required by React)
// ---------------------------------------------------------------------------

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class AppErrorBoundary extends Component<
  { children: ReactNode },
  ErrorBoundaryState
> {
  // Satisfy React 19 Component type (refs is legacy but required by typings)
  declare refs: Record<string, unknown>;

  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[AppErrorBoundary]", error, info);
    // Sentry.captureException is a no-op when no DSN is configured.
    try {
      Sentry.captureException(error);
    } catch {
      // Guard against any Sentry initialization errors
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-8" dir="rtl">
          <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-6">
              <svg className="w-8 h-8 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">משהו השתבש</h2>
            <p className="text-gray-600 mb-6">אירעה שגיאה בלתי צפויה. נסו שוב.</p>
            {process.env.NODE_ENV === "development" && this.state.error && (
              <details className="mb-6 text-left">
                <summary className="cursor-pointer text-sm text-gray-500">פרטי שגיאה</summary>
                <pre className="mt-2 p-3 bg-gray-100 rounded-lg text-xs text-red-600 overflow-auto max-h-40">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                נסה שוב
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition-colors"
              >
                טען מחדש
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export function Providers({ children }: { children: React.ReactNode }) {
  // Wire up 401 retry: refresh via HTTP-only cookie, then retry request.
  useEffect(() => {
    apiClient.setOn401Retry(async () => {
      const ok = await useAuthStore.getState().refreshAccessToken();
      return ok ? useAuthStore.getState().accessToken : null;
    });
    return () => apiClient.setOn401Retry(null);
  }, []);

  // On first mount, silently refresh the access token from the HTTP-only
  // refresh cookie so returning visitors are immediately authenticated.
  useEffect(() => {
    const { isAuthenticated, accessToken } = useAuthStore.getState();
    if (isAuthenticated && !accessToken) {
      // Attach a no-op catch so the fire-and-forget Promise never becomes
      // an unhandled rejection (which Next.js dev overlay shows as
      // "[object Event]" when the rejection value is a DOM Event).
      useAuthStore.getState().refreshAccessToken().catch(() => {});
    }
  }, []);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
            retry: 2,
          },
        },
      })
  );

  const ErrorBoundary = AppErrorBoundary as unknown as React.JSX.ElementType;
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <LocaleSyncProvider>
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- React 19 ReactNode typing conflict */}
          {children as any}
        </LocaleSyncProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
