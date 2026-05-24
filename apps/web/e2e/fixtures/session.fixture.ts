import {
  AdminPage,
  BuildingsManagerPage,
  DashboardPage,
  LoginPage,
  SignupPage,
} from "../pages";

import { test as baseTest } from "./pages.fixture";

export type SessionFixtures = {
  /** Login page, already navigated to /login */
  loginPageReady: LoginPage;
  /** Signup page, already navigated to /signup */
  signupPageReady: SignupPage;
  /** Mock auth + resident dashboard loaded */
  authenticatedResident: DashboardPage;
  /** Mock auth + contractor dashboard loaded */
  authenticatedContractor: DashboardPage;
  /** Mock auth + admin panel loaded */
  authenticatedAdmin: AdminPage;
  /** Mock auth + buildings-manager dashboard loaded */
  authenticatedBuildingsManager: BuildingsManagerPage;
};

export const test = baseTest.extend<SessionFixtures>({
  loginPageReady: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await use(loginPage);
  },

  signupPageReady: async ({ page }, use) => {
    const signupPage = new SignupPage(page);
    await signupPage.goto();
    await use(signupPage);
  },

  authenticatedResident: async ({ page, setupAuthAndMocks }, use) => {
    await setupAuthAndMocks("resident");
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await use(dashboard);
  },

  authenticatedContractor: async ({ page, setupAuthAndMocks }, use) => {
    await setupAuthAndMocks("contractor");
    const dashboard = new DashboardPage(page);
    await dashboard.gotoContractor();
    await use(dashboard);
  },

  authenticatedAdmin: async ({ page, setupAuthAndMocks }, use) => {
    await setupAuthAndMocks("admin");
    const admin = new AdminPage(page);
    await admin.goto();
    await use(admin);
  },

  authenticatedBuildingsManager: async ({ page, setupAuthAndMocks }, use) => {
    await setupAuthAndMocks("buildings_manager");
    const bm = new BuildingsManagerPage(page);
    await bm.gotoDashboard();
    await use(bm);
  },
});
