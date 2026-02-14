"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "@/lib/stores/authStore";

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
      useAuthStore.getState().refreshAccessToken();
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

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}
