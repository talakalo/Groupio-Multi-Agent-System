/**
 * Factory Util — admin app test data factories.
 */

import testData from "../config/test-data.json";

export function createSystemHealth(overrides?: Record<string, unknown>) {
  return { ...testData.systemHealth, ...overrides };
}

export function createDashboardStats(overrides?: Record<string, unknown>) {
  return { ...testData.dashboardStats, ...overrides };
}

export function createPendingContractors() {
  return [...testData.pendingContractors];
}

export function createEscalations() {
  return [...testData.escalations];
}

export interface MockResponse {
  status: number;
  contentType: string;
  body: string;
}

export function createMockResponse<T>(data: T, status = 200): MockResponse {
  return {
    status,
    contentType: "application/json",
    body: JSON.stringify(data),
  };
}
