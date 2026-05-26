import { BrowserManager } from "../api/browser-manager";

import { test as baseTest } from "./session.fixture";

export type BrowserFixtures = {
  browserManager: BrowserManager;
};

export const test = baseTest.extend<BrowserFixtures>({
  browserManager: async ({ browser }, use) => {
    const manager = new BrowserManager(browser);
    await use(manager);
    await manager.disposeAll();
  },
});
