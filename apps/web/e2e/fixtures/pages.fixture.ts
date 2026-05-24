import {
  AdminPage,
  ArchitecturePage,
  BuildingPage,
  BuildingsManagerPage,
  ChangePasswordPage,
  ContractorProfilePage,
  ContractorsPage,
  DashboardPage,
  LandingPage,
  LoginPage,
  OffersPage,
  OnboardingPage,
  ProfilePage,
  SignupPage,
  VerifyEmailPage,
} from "../pages";

import { test as baseTest } from "./mock.fixture";

export type PageObjectFixtures = {
  loginPage: LoginPage;
  signupPage: SignupPage;
  dashboardPage: DashboardPage;
  offersPage: OffersPage;
  adminPage: AdminPage;
  architecturePage: ArchitecturePage;
  profilePage: ProfilePage;
  buildingPage: BuildingPage;
  contractorsPage: ContractorsPage;
  buildingsManagerPage: BuildingsManagerPage;
  landingPage: LandingPage;
  onboardingPage: OnboardingPage;
  changePasswordPage: ChangePasswordPage;
  verifyEmailPage: VerifyEmailPage;
  contractorProfilePage: ContractorProfilePage;
};

export const test = baseTest.extend<PageObjectFixtures>({
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },

  signupPage: async ({ page }, use) => {
    await use(new SignupPage(page));
  },

  dashboardPage: async ({ page }, use) => {
    await use(new DashboardPage(page));
  },

  offersPage: async ({ page }, use) => {
    await use(new OffersPage(page));
  },

  adminPage: async ({ page }, use) => {
    await use(new AdminPage(page));
  },

  architecturePage: async ({ page }, use) => {
    await use(new ArchitecturePage(page));
  },

  profilePage: async ({ page }, use) => {
    await use(new ProfilePage(page));
  },

  buildingPage: async ({ page }, use) => {
    await use(new BuildingPage(page));
  },

  contractorsPage: async ({ page }, use) => {
    await use(new ContractorsPage(page));
  },

  buildingsManagerPage: async ({ page }, use) => {
    await use(new BuildingsManagerPage(page));
  },

  landingPage: async ({ page }, use) => {
    await use(new LandingPage(page));
  },

  onboardingPage: async ({ page }, use) => {
    await use(new OnboardingPage(page));
  },

  changePasswordPage: async ({ page }, use) => {
    await use(new ChangePasswordPage(page));
  },

  verifyEmailPage: async ({ page }, use) => {
    await use(new VerifyEmailPage(page));
  },

  contractorProfilePage: async ({ page }, use) => {
    await use(new ContractorProfilePage(page));
  },
});
