import {
  loginAs as loginAsAction,
  setupAuthAndMocks as setupAuthAndMocksAction,
  setupBaseMocks,
  type SetupBaseMocksOptions,
} from "../api/actions";
import { type UserRole } from "../helpers/user.factory";

import { test as baseTest } from "./base.fixture";

export type MockFixtures = {
  loginAs: (role: UserRole) => Promise<void>;
  setupMocks: () => Promise<void>;
  setupAuthAndMocks: (role?: UserRole, opts?: SetupBaseMocksOptions) => Promise<void>;
};

export const test = baseTest.extend<MockFixtures>({
  loginAs: async ({ page }, use) => {
    await use((role: UserRole) => loginAsAction(page, role));
  },

  setupMocks: async ({ page }, use) => {
    await use(() => setupBaseMocks(page));
  },

  setupAuthAndMocks: async ({ page }, use) => {
    await use((role: UserRole = "resident", opts: SetupBaseMocksOptions = {}) =>
      setupAuthAndMocksAction(page, role, opts),
    );
  },
});
