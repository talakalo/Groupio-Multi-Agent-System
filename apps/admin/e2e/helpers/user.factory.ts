/**
 * User Factory — admin app test user factories.
 */

import testData from "../config/test-data.json";

export interface AdminCredentials {
  email: string;
  password: string;
  name: string;
}

export function createAdminCredentials(overrides?: Partial<AdminCredentials>): AdminCredentials {
  return { ...testData.users.admin, ...overrides };
}
