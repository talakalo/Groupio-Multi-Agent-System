/**
 * Fallback for Next.js generated types when .next/types is not present (e.g. tsc --noEmit in CI).
 * Next.js generates .next/types/routes.d.ts on build; this file provides LayoutProps so typecheck passes.
 */
import type { ReactNode } from "react";

declare global {
  type LayoutRoutes = "/" | "/contractor";
  type LayoutProps<LayoutRoute extends LayoutRoutes = "/"> = {
    params: Promise<Record<string, unknown>>;
    children: ReactNode;
  };
}

export {};
