import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) => {
    const map: Record<string, string> = {
      title: "Create a building",
      subtitle: "Once created, share the invite code with residents.",
      nameLabel: "Name",
      addressLabel: "Address",
      cityLabel: "City",
      regionLabel: "Region",
      totalUnitsLabel: "Total units",
      floorsLabel: "Floors",
      submit: "Create",
      cancel: "Cancel",
      close: "Close",
      errorMissingFields: "Name, address and city are required",
      errorForbidden: "Forbidden",
      errorGeneric: "Failed",
    };
    if (vars && key.startsWith("regions.")) return key;
    return map[key] ?? key;
  },
}));

const mockCreateBuilding = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    createBuilding: (...args: unknown[]) => mockCreateBuilding(...args),
  },
  ApiError: class ApiError extends Error {
    constructor(public message: string, public status?: number) {
      super(message);
    }
  },
}));

import { BuildingCreateModal } from "../components/features/buildings/BuildingCreateModal";

function renderWithQuery(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mockCreateBuilding.mockReset();
});

describe("BuildingCreateModal", () => {
  it("renders nothing when closed", () => {
    const { queryByTestId } = renderWithQuery(
      <BuildingCreateModal open={false} onClose={() => {}} />,
    );
    expect(queryByTestId("building-create-modal")).toBeNull();
  });

  it("renders the form when open", () => {
    renderWithQuery(<BuildingCreateModal open onClose={() => {}} />);
    expect(screen.getByTestId("building-create-modal")).toBeInTheDocument();
    expect(screen.getByTestId("building-create-name")).toBeInTheDocument();
    expect(screen.getByTestId("building-create-address")).toBeInTheDocument();
    expect(screen.getByTestId("building-create-city")).toBeInTheDocument();
  });

  it("validates required fields client-side", async () => {
    renderWithQuery(<BuildingCreateModal open onClose={() => {}} />);
    fireEvent.submit(screen.getByTestId("building-create-submit").closest("form")!);
    // Empty inputs trigger native required — no API call.
    expect(mockCreateBuilding).not.toHaveBeenCalled();
  });

  it("submits the typed payload and calls onCreated", async () => {
    mockCreateBuilding.mockResolvedValueOnce({
      id: "b-new",
      name: "Sea View",
      invite_code: "AAAAAAAA",
    });
    const onCreated = vi.fn();
    const onClose = vi.fn();
    renderWithQuery(
      <BuildingCreateModal open onClose={onClose} onCreated={onCreated} />,
    );

    fireEvent.change(screen.getByTestId("building-create-name"), {
      target: { value: "Sea View" },
    });
    fireEvent.change(screen.getByTestId("building-create-address"), {
      target: { value: "1 Main" },
    });
    fireEvent.change(screen.getByTestId("building-create-city"), {
      target: { value: "Tel Aviv" },
    });

    fireEvent.click(screen.getByTestId("building-create-submit"));

    await waitFor(() => expect(mockCreateBuilding).toHaveBeenCalled());
    expect(mockCreateBuilding).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Sea View",
        address: "1 Main",
        city: "Tel Aviv",
        region: "tel_aviv",
      }),
    );
    await waitFor(() =>
      expect(onCreated).toHaveBeenCalledWith({
        id: "b-new",
        name: "Sea View",
        invite_code: "AAAAAAAA",
      }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("renders the API error in the form", async () => {
    mockCreateBuilding.mockRejectedValueOnce(new Error("boom"));
    renderWithQuery(<BuildingCreateModal open onClose={() => {}} />);

    fireEvent.change(screen.getByTestId("building-create-name"), {
      target: { value: "X" },
    });
    fireEvent.change(screen.getByTestId("building-create-address"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByTestId("building-create-city"), {
      target: { value: "T" },
    });
    fireEvent.click(screen.getByTestId("building-create-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("building-create-error")).toBeInTheDocument(),
    );
  });
});
