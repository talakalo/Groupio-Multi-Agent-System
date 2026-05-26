/**
 * User Factory — creates typed user objects for tests.
 * Defaults come from test-data.json; override any field via the overrides param.
 */

import testData from "../config/test-data.json";

export type UserRole =
  | "resident"
  | "contractor"
  | "admin"
  | "buildings_manager"
  | "super_admin";

export interface MockUser {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  role: UserRole;
  is_active: boolean;
  is_verified: boolean;
  building_id: string | null;
  contractor_id: string | null;
  avatar_url: string | null;
  preferred_language: string;
  created_at: string;
  updated_at: string;
}

export interface ResidentCredentials {
  email: string;
  password: string;
  name: string;
  phone: string;
  buildingId: string;
  apartmentNumber: string;
}

export interface ContractorCredentials {
  email: string;
  password: string;
  businessName: string;
  licenseNumber: string;
  phone: string;
  categories: string[];
  regions: string[];
}

export interface AdminCredentials {
  email: string;
  password: string;
  name: string;
}

/** Returns a mock API user object for the resident role */
export function createResidentUser(overrides?: Partial<MockUser>): MockUser {
  return { ...testData.users.resident, role: "resident", ...overrides } as MockUser;
}

/** Returns a mock API user object for the contractor role */
export function createContractorUser(overrides?: Partial<MockUser>): MockUser {
  return { ...testData.users.contractor, role: "contractor", ...overrides } as MockUser;
}

/** Returns test login credentials for a resident user */
export function createResidentCredentials(
  overrides?: Partial<ResidentCredentials>,
): ResidentCredentials {
  return { ...testData.users.residentFlow, ...overrides };
}

/** Returns test login credentials for a contractor user */
export function createContractorCredentials(
  overrides?: Partial<ContractorCredentials>,
): ContractorCredentials {
  return { ...testData.users.contractorFlow, ...overrides };
}

/** Returns test login credentials for an admin user */
export function createAdminCredentials(
  overrides?: Partial<AdminCredentials>,
): AdminCredentials {
  return { ...testData.users.admin, ...overrides };
}

/** Returns the correct mock user object for a given role */
export function getMockUserForRole(role: UserRole): MockUser {
  switch (role) {
    case "resident":
      return createResidentUser();
    case "contractor":
      return createContractorUser();
    case "admin":
      return createResidentUser({ role: "admin", email: testData.users.admin.email });
    case "buildings_manager":
      return createResidentUser({
        role: "buildings_manager",
        id: "user-bm-e2e",
        email: "bm@e2e.example.com",
      });
    case "super_admin":
      return createResidentUser({
        role: "super_admin",
        id: "user-sa-e2e",
        email: "super@e2e.example.com",
      });
  }
}
