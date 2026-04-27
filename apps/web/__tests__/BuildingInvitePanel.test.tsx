import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => {
    const map: Record<string, string> = {
      label: "Invite code",
      copy: "Copy",
      copied: "Copied",
      share: "Share",
      rotate: "Rotate code",
      rotateHint: "Rotating invalidates the previous code immediately.",
      rotateError: "Failed",
    };
    if (key === "shareMessage") return `Join "${vars?.buildingName}": ${vars?.code}`;
    return map[key] ?? key;
  },
}));

const mockRegenerate = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    regenerateBuildingInviteCode: (...args: unknown[]) => mockRegenerate(...args),
  },
}));

import { BuildingInvitePanel } from "../components/features/buildings/BuildingInvitePanel";

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mockRegenerate.mockReset();
  // jsdom only ships clipboard.writeText behind navigator.permissions in some
  // environments — stub it directly.
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe("BuildingInvitePanel", () => {
  it("renders the invite code prominently", () => {
    renderWithQuery(
      <BuildingInvitePanel
        buildingId="b-1"
        buildingName="Sea View"
        inviteCode="ABCDEFGH"
      />,
    );
    expect(screen.getByText("ABCDEFGH")).toBeInTheDocument();
  });

  it("hides the rotate button when canRotate is false", () => {
    renderWithQuery(
      <BuildingInvitePanel
        buildingId="b-1"
        buildingName="Sea View"
        inviteCode="ABCDEFGH"
      />,
    );
    expect(screen.queryByTestId("building-invite-rotate")).toBeNull();
  });

  it("shows the rotate button when canRotate is true", () => {
    renderWithQuery(
      <BuildingInvitePanel
        buildingId="b-1"
        buildingName="Sea View"
        inviteCode="ABCDEFGH"
        canRotate
      />,
    );
    expect(screen.getByTestId("building-invite-rotate")).toBeInTheDocument();
  });

  it("copies the invite code to the clipboard", async () => {
    renderWithQuery(
      <BuildingInvitePanel
        buildingId="b-1"
        buildingName="Sea View"
        inviteCode="ABCDEFGH"
      />,
    );
    fireEvent.click(screen.getByTestId("building-invite-copy"));
    await waitFor(() =>
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith("ABCDEFGH"),
    );
  });

  it("rotates the invite code via the API client", async () => {
    mockRegenerate.mockResolvedValueOnce({
      building_id: "b-1",
      invite_code: "NEWCODE9",
    });
    const onRotated = vi.fn();
    renderWithQuery(
      <BuildingInvitePanel
        buildingId="b-1"
        buildingName="Sea View"
        inviteCode="ABCDEFGH"
        canRotate
        onRotated={onRotated}
      />,
    );

    fireEvent.click(screen.getByTestId("building-invite-rotate"));

    await waitFor(() => expect(mockRegenerate).toHaveBeenCalledWith("b-1"));
    await waitFor(() => expect(screen.getByText("NEWCODE9")).toBeInTheDocument());
    expect(onRotated).toHaveBeenCalledWith("NEWCODE9");
  });

  it("renders an error banner when rotation fails", async () => {
    mockRegenerate.mockRejectedValueOnce(new Error("forbidden"));
    renderWithQuery(
      <BuildingInvitePanel
        buildingId="b-1"
        buildingName="Sea View"
        inviteCode="ABCDEFGH"
        canRotate
      />,
    );
    fireEvent.click(screen.getByTestId("building-invite-rotate"));
    await waitFor(() =>
      expect(screen.getByTestId("building-invite-error")).toBeInTheDocument(),
    );
  });
});
