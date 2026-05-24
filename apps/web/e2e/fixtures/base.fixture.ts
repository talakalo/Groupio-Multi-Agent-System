import { test as base, type Page } from "@playwright/test";

/** Use domcontentloaded so Next.js dev-mode navigation does not hang on networkidle. */
export function patchGoto(page: Page): void {
  const orig = page.goto.bind(page);
  (page as unknown as Record<string, unknown>).goto = (
    url: string | undefined,
    options?: Parameters<Page["goto"]>[1],
  ) => orig(url as string, { waitUntil: "domcontentloaded", ...options });
}

export const test = base.extend({
  page: async ({ page }, use) => {
    patchGoto(page);
    await use(page);
  },
});

export type BaseFixtures = {
  page: Page;
};
