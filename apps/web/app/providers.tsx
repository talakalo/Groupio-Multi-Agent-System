"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { apiClient } from "@/lib/api/client";
import { useAuthStore } from "@/lib/stores/authStore";

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    apiClient.setOn401Retry(async () => {
      const ok = await useAuthStore.getState().refreshAccessToken();
      const token = useAuthStore.getState().accessToken;
      if (ok && token && typeof window !== "undefined") {
        window.localStorage.setItem("auth_token", token);
        return token;
      }
      return null;
    });
    return () => apiClient.setOn401Retry(null);
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
