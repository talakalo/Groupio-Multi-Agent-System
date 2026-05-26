/* eslint-disable @typescript-eslint/no-require-imports, import/first */
import React from "react";
import { describe, expect, it, vi, beforeEach } from "vitest";

// vi.mock is hoisted before top-level variable declarations, so anything
// referenced inside a mock factory must itself be hoisted via vi.hoisted().
const { joinBuildingMock, MockApiError, pushMock, replaceMock } = vi.hoisted(
  () => {
    class MockApiError extends Error {
      status?: number;
      constructor(message: string, status?: number) {
        super(message);
        this.status = status;
      }
    }
    return {
      joinBuildingMock: vi.fn(),
      MockApiError,
      pushMock: vi.fn(),
      replaceMock: vi.fn(),
    };
  },
);

vi.mock("../lib/api", () => ({
  joinBuilding: (...args: unknown[]) => joinBuildingMock(...args),
  ApiError: MockApiError,
}));

vi.mock("../lib/i18n", () => ({
  default: {
    t: (k: string, _vars?: Record<string, unknown>) => k,
  },
}));

vi.mock("expo-router", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock, back: vi.fn() }),
  useLocalSearchParams: () => ({}),
  Stack: { Screen: "Screen" },
}));

import { render, fireEvent } from "@testing-library/react-native";
import JoinBuildingScreen from "../app/join-building";

describe("JoinBuildingScreen", () => {
  beforeEach(() => {
    joinBuildingMock.mockReset();
    pushMock.mockReset();
    replaceMock.mockReset();
  });

  it("submit is disabled when the code is too short", () => {
    const { getByTestId } = render(<JoinBuildingScreen />);
    const submit = getByTestId("join-building-submit");
    expect(submit.props.disabled).toBe(true);
  });

  it("uppercases what the user types into the code field", () => {
    const { getByTestId } = render(<JoinBuildingScreen />);
    const input = getByTestId("join-building-code");
    fireEvent.changeText(input, "abcdefgh");
    expect(input.props.value).toBe("ABCDEFGH");
  });

  it("calls joinBuilding when the form is submitted", async () => {
    joinBuildingMock.mockResolvedValueOnce(undefined);
    const { getByTestId } = render(<JoinBuildingScreen />);
    fireEvent.changeText(getByTestId("join-building-code"), "ABCDEFGH");
    fireEvent.press(getByTestId("join-building-submit"));
    await new Promise((r) => setImmediate(r));
    expect(joinBuildingMock).toHaveBeenCalledWith("ABCDEFGH");
  });

  it("surfaces a 404 from the API as a 'no match' message", async () => {
    joinBuildingMock.mockRejectedValueOnce(new MockApiError("nope", 404));
    const { getByTestId, queryByText } = render(<JoinBuildingScreen />);
    fireEvent.changeText(getByTestId("join-building-code"), "ABCDEFGH");
    fireEvent.press(getByTestId("join-building-submit"));
    await new Promise((r) => setImmediate(r));
    expect(queryByText(/building.inviteNotFound/)).toBeTruthy();
  });

  it("redirects to /(tabs) after a successful join", async () => {
    joinBuildingMock.mockResolvedValueOnce(undefined);
    const { getByTestId } = render(<JoinBuildingScreen />);
    fireEvent.changeText(getByTestId("join-building-code"), "ABCDEFGH");
    fireEvent.press(getByTestId("join-building-submit"));
    await new Promise((r) => setImmediate(r));
    fireEvent.press(getByTestId("join-building-go-home"));
    expect(replaceMock).toHaveBeenCalledWith("/(tabs)");
  });
});
